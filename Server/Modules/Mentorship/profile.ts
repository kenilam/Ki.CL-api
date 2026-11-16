import * as v from 'valibot';

import type { MentorshipQuote, MentorshipSession } from 'server/DataSources/MongoDB/Mentorships/Model.js';

const PAGE = 'https://adplist.org/mentors';

const TIMEOUT_MS = 15_000;

const MAX_QUOTES = 12;

const MAX_QUOTE_LENGTH = 2_000;

// The page is a Next.js page, which ships what it renders as JSON in this tag.
const DATA = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;

const Page = v.object({
  props: v.object({
    pageProps: v.object({
      reviewStats: v.object({ count: v.number(), avg: v.number() }),
      reviews: v.array(
        v.object({
          status: v.string(),
          review: v.string(),
          rating: v.number(),
          createdOn: v.number(),
          reviewedByUser: v.nullish(
            v.object({
              title: v.nullish(v.string()),
              organization: v.nullish(v.string()),
            }),
          ),
        }),
      ),
      sessions: v.array(v.object({ title: v.string(), duration: v.number() })),
    }),
  }),
});

export type MentorProfile = {
  reviews: { count: number; average: number };
  quotes: MentorshipQuote[];
  sessions: MentorshipSession[];
};

function read(html: string): MentorProfile | null {
  const data = DATA.exec(html)?.[1];

  if (!data) {
    return null;
  }

  let json: unknown;

  try {
    json = JSON.parse(data);
  } catch {
    return null;
  }

  const page = v.safeParse(Page, json);

  if (!page.success) {
    return null;
  }

  const { reviewStats, reviews, sessions } = page.output.props.pageProps;

  return {
    reviews: { count: reviewStats.count, average: reviewStats.avg },
    quotes: reviews
      .filter(({ status, review }) => status === 'active' && review.trim().length > 0)
      .slice(0, MAX_QUOTES)
      .map(({ review, rating, createdOn, reviewedByUser }) => ({
        text: review.trim().slice(0, MAX_QUOTE_LENGTH),
        rating,
        writtenAt: new Date(createdOn),
        title: reviewedByUser?.title?.trim() || null,
        organisation: reviewedByUser?.organization?.trim() || null,
      })),
    sessions: sessions.map(({ title, duration }) => ({ title: title.trim(), minutes: duration })),
  };
}

export async function fetchMentorProfile(slug: string): Promise<MentorProfile | null> {
  const response = await fetch(`${PAGE}/${encodeURIComponent(slug)}`, {
    headers: { accept: 'text/html' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    return null;
  }

  return read(await response.text());
}
