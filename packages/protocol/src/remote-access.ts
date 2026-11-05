import { z } from "zod";

export const ControllerCredentialSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  accountAuthorization: z.string().max(2048).optional(),
  invitation: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .optional(),
  label: z.string().trim().min(1).max(100).optional(),
});
export type ControllerCredential = z.infer<typeof ControllerCredentialSchema>;

export const AccessBindAccountRequestSchema = z.object({
  type: z.literal("access.account.bind.request"),
  requestId: z.string(),
  accountId: z.string().min(1).max(255),
});
export const AccessBindAccountResponseSchema = z.object({
  type: z.literal("access.account.bind.response"),
  payload: z.object({
    requestId: z.string(),
    accountKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  }),
});

export const RemoteAccessStateSchema = z.object({
  enabled: z.boolean(),
  controlledOnly: z.boolean(),
  receiving: z.boolean(),
  canToggleReceiving: z.boolean(),
  canManage: z.boolean(),
  canPair: z.boolean(),
  controllers: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      fingerprint: z.string(),
      manager: z.boolean(),
      status: z.enum(["pending", "authorized"]),
      createdAt: z.string(),
      expiresAt: z.string().nullable(),
    }),
  ),
});
export type RemoteAccessState = z.infer<typeof RemoteAccessStateSchema>;

export const AccessGetStateRequestSchema = z.object({
  type: z.literal("access.get_state.request"),
  requestId: z.string(),
});
export const AccessCreateInvitationRequestSchema = z.object({
  type: z.literal("access.create_invitation.request"),
  requestId: z.string(),
  // Initial management pairing locks this installation into controlled-only mode.
  bootstrap: z.boolean().optional(),
  manager: z.boolean().optional(),
});
export const AccessDecidePairingRequestSchema = z.object({
  type: z.literal("access.decide_pairing.request"),
  requestId: z.string(),
  controllerId: z.string(),
  approve: z.boolean(),
  persistent: z.boolean(),
});
export const AccessRevokeControllerRequestSchema = z.object({
  type: z.literal("access.revoke_controller.request"),
  requestId: z.string(),
  controllerId: z.string(),
});
export const AccessSetReceivingRequestSchema = z.object({
  type: z.literal("access.set_receiving.request"),
  requestId: z.string(),
  receiving: z.boolean(),
});
export const AccessSetReceivingResponseSchema = z.object({
  type: z.literal("access.set_receiving.response"),
  payload: z.object({ requestId: z.string(), state: RemoteAccessStateSchema }),
});
export const AccessSetModeRequestSchema = z.object({
  type: z.literal("access.set_mode.request"),
  requestId: z.string(),
  controlledOnly: z.boolean(),
});
export const AccessGetStateResponseSchema = z.object({
  type: z.literal("access.get_state.response"),
  payload: z.object({ requestId: z.string(), state: RemoteAccessStateSchema }),
});
export const AccessCreateInvitationResponseSchema = z.object({
  type: z.literal("access.create_invitation.response"),
  payload: z.object({ requestId: z.string(), url: z.string(), expiresAt: z.string() }),
});
export const AccessDecidePairingResponseSchema = z.object({
  type: z.literal("access.decide_pairing.response"),
  payload: z.object({ requestId: z.string(), state: RemoteAccessStateSchema }),
});
export const AccessRevokeControllerResponseSchema = z.object({
  type: z.literal("access.revoke_controller.response"),
  payload: z.object({ requestId: z.string(), state: RemoteAccessStateSchema }),
});
export const AccessSetModeResponseSchema = z.object({
  type: z.literal("access.set_mode.response"),
  payload: z.object({ requestId: z.string(), state: RemoteAccessStateSchema }),
});

export const WSPairingPendingMessageSchema = z.object({
  type: z.literal("pairing.pending"),
  controllerId: z.string(),
  fingerprint: z.string(),
  expiresAt: z.string(),
});
