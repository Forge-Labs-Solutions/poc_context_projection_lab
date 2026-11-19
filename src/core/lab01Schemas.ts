import { z } from "zod";

export const sentenceSchema = z.string().min(1);
export const paragraphSchema = z.object({
  sentences: z.array(sentenceSchema).min(1),
});
export const sectionSchema = z.object({
  title: z.string().min(1),
  paragraphs: z.array(paragraphSchema).min(1),
});

export const importDocumentSchema = z.object({
  resourceKey: z.string().min(1),
  title: z.string().min(1),
  text: z.string().min(1),
  parentFcid: z.string().min(1).optional(),
});

export const createChatSchema = z.object({
  resourceKey: z.string().min(1),
  title: z.string().min(1),
});

export const addChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]).default("user"),
  text: z.string().min(1),
});

export const importChatSchema = z.object({
  resourceKey: z.string().min(1),
  title: z.string().min(1),
  messages: z
    .array(
      z.object({
        fcid: z.string().min(1).optional(),
        role: z.enum(["user", "assistant", "system"]),
        text: z.string().min(1),
      }),
    )
    .max(5000),
});

export const removeProjectionSchema = z.object({
  projectionId: z.string().min(1),
});

export const importDirectorySchema = z.object({
  title: z.string().min(1),
  parentFcid: z.string().min(1).optional(),
  documents: z.array(importDocumentSchema).min(1),
});
