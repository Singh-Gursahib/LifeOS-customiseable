"use server";

import { setPin, isValidPin, PIN_LENGTH } from "@/lib/auth";
import { requireSpace } from "@/lib/space";
import { SpaceId, isSpaceId } from "@/lib/session";

export type PinResult = { ok: true } | { ok: false; error: string };

/**
 * Change either space's PIN. Only reachable from the private space — the decoy has
 * no route to this and the guard below is what enforces it, not just the hidden UI.
 */
export async function changePinAction(target: SpaceId, pin: string, confirm: string): Promise<PinResult> {
  const space = await requireSpace();
  if (space !== "private") return { ok: false, error: "Not available here." };
  if (!isSpaceId(target)) return { ok: false, error: "Unknown account." };
  if (!isValidPin(pin)) return { ok: false, error: `PIN must be exactly ${PIN_LENGTH} digits.` };
  if (pin !== confirm) return { ok: false, error: "The two PINs don't match." };
  return setPin(target, pin);
}
