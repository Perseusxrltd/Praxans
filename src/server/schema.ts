import { z } from "zod";

export const materialSchema = z.enum([
  "biomass",
  "wood",
  "fiber",
  "stone",
  "clay",
]);
const label = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .regex(
    /^[\p{L}\p{N} .,'’()_-]+$/u,
    "Use letters, numbers, spaces, and simple punctuation.",
  );
export const designSchema = z
  .object({
    name: label,
    components: z
      .array(
        z
          .object({
            material: materialSchema,
            x: z.number().min(-5).max(5),
            y: z.number().min(-5).max(5),
            z: z.number().min(0).max(8),
            width: z.number().min(0.025).max(6),
            depth: z.number().min(0.025).max(6),
            height: z.number().min(0.025).max(6),
          })
          .strict(),
      )
      .min(1)
      .max(32),
  })
  .strict();
const reason = z.string().trim().min(1).max(400);
const goods = z
  .object({ material: materialSchema, amount: z.number().min(1).max(80) })
  .strict();
const priorities = z
  .object({
    wellbeing: z.number().min(0).max(10),
    resilience: z.number().min(0).max(10),
    knowledge: z.number().min(0).max(10),
    ecology: z.number().min(0).max(10),
    connection: z.number().min(0).max(10),
    reach: z.number().min(0).max(10),
  })
  .strict()
  .refine(
    (w) => Object.values(w).some((n) => n > 0),
    "Give at least one dimension positive weight.",
  );
const term = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("peace"), days: z.number().int().min(1).max(30) })
    .strict(),
  z
    .object({
      kind: z.literal("passage"),
      from: z.enum(["sender", "recipient"]),
      days: z.number().int().min(1).max(30),
    })
    .strict(),
  z
    .object({
      kind: z.literal("transfer"),
      from: z.enum(["sender", "recipient"]),
      goods,
      days: z.number().int().min(1).max(30),
    })
    .strict(),
]);
const contactId = z.string().min(1).max(64);
const letter = z.string().trim().min(1).max(1200);
export const actionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("focus"),
      focus: z.enum([
        "balance",
        "nourish",
        "build",
        "discover",
        "connect",
        "preserve",
      ]),
      reason,
    })
    .strict(),
  z
    .object({
      type: z.literal("policy"),
      policy: z.enum(["sharing", "effort", "extraction"]),
      value: z.number().min(0).max(1),
      reason,
    })
    .strict(),
  z
    .object({ type: z.literal("assemble"), design: designSchema, reason })
    .strict(),
  z
    .object({ type: z.literal("experiment"), design: designSchema, reason })
    .strict(),
  z
    .object({
      type: z.literal("repair"),
      structureId: z.string().min(1).max(64),
      reason,
    })
    .strict(),
  z
    .object({
      type: z.literal("aspiration"),
      statement: z.string().trim().min(1).max(240),
      weights: priorities,
      reason,
    })
    .strict(),
  z
    .object({
      type: z.literal("institution"),
      quorum: z.number().min(0.5).max(1),
      consent: z.number().min(0.5).max(1),
      foodReserveDays: z.number().min(0.5).max(7),
      reason,
    })
    .strict(),
  z
    .object({
      type: z.literal("communicate"),
      target: contactId,
      text: letter,
      terms: z.array(term).max(6),
      reason,
    })
    .strict(),
  z
    .object({
      type: z.literal("respond"),
      messageId: contactId,
      decision: z.enum(["accept", "decline"]),
      text: letter,
      reason,
    })
    .strict(),
  z
    .object({
      type: z.literal("expedition"),
      target: contactId,
      people: z.number().int().min(1).max(3),
      material: materialSchema,
      reason,
    })
    .strict(),
  z
    .object({
      type: z.literal("trade"),
      target: z.string().min(1).max(64),
      offer: goods,
      receive: goods,
      reason,
    })
    .strict(),
  z
    .object({
      type: z.literal("diplomacy"),
      target: z.string().min(1).max(64),
      stance: z.enum(["friendship", "neutrality", "rivalry"]),
      reason,
    })
    .strict(),
]);
export const batchSchema = z
  .object({
    requestId: z
      .string()
      .min(8)
      .max(100)
      .regex(/^[a-zA-Z0-9_.:-]+$/),
    actions: z.array(actionSchema).min(1).max(6),
  })
  .strict();
export const claimSchema = z
  .object({
    civilizationId: z.string().max(64).optional(),
    name: label.optional(),
    afterExtinction: z.literal(true).optional(),
  })
  .strict()
  .refine(
    (v) => !!v.civilizationId !== !!v.name,
    "Choose an existing civilization or name a new branch.",
  )
  .refine(
    (v) => !v.afterExtinction || !!v.name,
    "A new beginning after extinction needs a new community name.",
  );
export const agentSchema = z
  .object({ name: label, provider: z.string().trim().min(1).max(40) })
  .strict();
