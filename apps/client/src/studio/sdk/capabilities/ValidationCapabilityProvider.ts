import { validateWorldObject } from "../../../components/DevTools/validation/validateWorldObject";
import type { ValidationProvider } from "./CapabilityProvider";

/**
 * Premier Capability Provider.
 * Délègue vers validateWorldObject pour tout WorldObject portant la capability "validation".
 */
export const validationCapabilityProvider: ValidationProvider = {
  kind: "validation",
  capabilities: ["validation"],
  validate: (obj) => validateWorldObject(obj),
};
