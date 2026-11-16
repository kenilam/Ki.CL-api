import mongoose, { Schema, type Document } from 'mongoose';

export type MentorshipQuote = {
  text: string;
  rating: number;
  writtenAt: Date;
  title: string | null;
  organisation: string | null;
};

export type MentorshipSession = {
  title: string;
  minutes: number;
};

export interface IMentorship extends Document {
  slug: string;
  reviews: { count: number; average: number } | null;
  quotes: MentorshipQuote[];
  sessions: MentorshipSession[];
  fetchedAt: Date | null;
  attemptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const MentorshipSchema = new Schema<IMentorship>(
  {
    slug: { type: String, required: true, unique: true },
    reviews: {
      type: new Schema({ count: Number, average: Number }, { _id: false }),
      default: null,
    },
    quotes: {
      type: [
        new Schema(
          { text: String, rating: Number, writtenAt: Date, title: String, organisation: String },
          { _id: false },
        ),
      ],
      default: [],
    },
    sessions: {
      type: [new Schema({ title: String, minutes: Number }, { _id: false })],
      default: [],
    },
    fetchedAt: { type: Date, default: null },
    attemptedAt: { type: Date, default: null },
  },
  {
    collection: 'mentorships',
    timestamps: true,
  },
);

export const Mentorships = mongoose.models.Mentorships as mongoose.Model<IMentorship>
  || mongoose.model<IMentorship>('Mentorships', MentorshipSchema);
