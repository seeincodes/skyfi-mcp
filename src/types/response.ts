import { z } from "zod";

export const ResponseMetaSchema = z.object({
  request_id: z.string(),
  duration_ms: z.number(),
  skyfi_api_version: z.string().optional(),
});

export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;

export const WarningSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export type Warning = z.infer<typeof WarningSchema>;

export const ErrorDetailSchema = z.object({
  code: z.string(),
  message: z.string(),
  recoverable: z.boolean(),
  retry_tool: z.string().optional(),
});

export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

export const SuccessResponseSchema = z.object({
  status: z.literal("success"),
  tool: z.string(),
  version: z.string(),
  simulated: z.boolean(),
  data: z.record(z.string(), z.unknown()),
  meta: ResponseMetaSchema,
  warnings: z.array(WarningSchema),
});

export type SuccessResponse = z.infer<typeof SuccessResponseSchema>;

export const ErrorResponseSchema = z.object({
  status: z.literal("error"),
  tool: z.string(),
  version: z.string(),
  error: ErrorDetailSchema,
  meta: ResponseMetaSchema,
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const ToolResponseSchema = z.discriminatedUnion("status", [
  SuccessResponseSchema,
  ErrorResponseSchema,
]);

export type ToolResponse = z.infer<typeof ToolResponseSchema>;
