import { Mentorships, type IMentorship } from 'server/DataSources/MongoDB/Mentorships/Model.js';
import { fetchMentorProfile } from './profile.js';

const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

const RETRY_MS = 60 * 60 * 1000;

const DUPLICATE_KEY = 11000;

/**
 * Takes the turn to read the profile, so one request in one instance does it.
 * The upsert only matches a record nobody has tried within the hour. When
 * someone has, it tries to insert a second record for the slug and fails on
 * the unique index, which is the answer no.
 */
async function claim(slug: string): Promise<boolean> {
  const before = new Date(Date.now() - RETRY_MS);

  try {
    await Mentorships.updateOne(
      { slug, $or: [{ attemptedAt: null }, { attemptedAt: { $lt: before } }] },
      { $set: { attemptedAt: new Date() } },
      { upsert: true },
    );

    return true;
  } catch (error) {
    if ((error as { code?: number }).code === DUPLICATE_KEY) {
      return false;
    }

    throw error;
  }
}

async function refresh(slug: string): Promise<void> {
  if (!(await claim(slug))) {
    return;
  }

  const profile = await fetchMentorProfile(slug);

  if (!profile) {
    console.error(`[Mentorship] The profile of "${slug}" could not be read. The stored copy stays.`);

    return;
  }

  await Mentorships.updateOne({ slug }, { $set: { ...profile, fetchedAt: new Date() } });
}

const stored = (slug: string) => Mentorships.findOne({ slug, fetchedAt: { $ne: null } }).lean<IMentorship>();

export async function readMentorship(): Promise<IMentorship | null> {
  const slug = process.env.ADPLIST_MENTOR_SLUG?.trim();

  if (!slug) {
    return null;
  }

  const copy = await stored(slug);

  if (!copy?.fetchedAt) {
    await refresh(slug).catch((error: Error) => {
      console.error(`[Mentorship] ${error.message}`);
    });

    return stored(slug);
  }

  if (Date.now() - copy.fetchedAt.getTime() > KEEP_MS) {
    // Not awaited: the visitor gets the stored copy now, and the next one the new.
    void refresh(slug).catch((error: Error) => {
      console.error(`[Mentorship] ${error.message}`);
    });
  }

  return copy;
}
