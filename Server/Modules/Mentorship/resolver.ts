import { readMentorship } from './read.js';

export default {
  Query: {
    mentorship: async () => {
      const copy = await readMentorship();

      if (!copy?.reviews || !copy.fetchedAt) {
        return null;
      }

      return {
        reviews: copy.reviews,
        quotes: copy.quotes,
        sessions: copy.sessions,
        fetchedAt: copy.fetchedAt,
      };
    },
  },
};
