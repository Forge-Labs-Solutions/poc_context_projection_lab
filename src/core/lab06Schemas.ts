import { z } from "zod";

export const synthesizeSchema = z
  .object({
    kind: z.enum(["document", "chat", "view"]).default("view"),
    title: z.string().min(1).optional(),
    items: z.array(z.string().min(1)).min(1).max(200).optional(),
    template: z.string().min(1).optional(),
    random: z
      .object({
        type: z.enum(["SN", "PG", "SS", "MS"]),
        count: z.number().int().min(1).max(50),
        seed: z.number().int().min(0).max(4294967295).optional(),
        scope: z.string().min(1).optional(),
      })
      .optional(),
    expand: z.boolean().default(true),
    maxDepth: z.number().int().min(1).max(5).default(3),
    format: z.enum(["markdown", "text"]).default("markdown"),
  })
  .superRefine((value, ctx) => {
    const modes = [value.items, value.template, value.random].filter((mode) => mode !== undefined).length;
    if (modes !== 1) {
      ctx.addIssue({ code: "custom", message: "Provide exactly one of items, template or random" });
    }
    if (value.kind === "chat" && value.title !== undefined) {
      ctx.addIssue({ code: "custom", message: "title is not allowed for kind chat", path: ["title"] });
    }
    if (value.kind === "chat" && value.template !== undefined) {
      ctx.addIssue({ code: "custom", message: "template is not allowed for kind chat", path: ["template"] });
    }
  });
