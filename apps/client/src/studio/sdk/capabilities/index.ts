import { CapabilityRegistry } from "./CapabilityRegistry";
import { validationCapabilityProvider } from "./ValidationCapabilityProvider";

export const capabilityRegistry = new CapabilityRegistry();
capabilityRegistry.register(validationCapabilityProvider);

export { CapabilityRegistry } from "./CapabilityRegistry";
export { isValidationProvider } from "./CapabilityProvider";
export type { CapabilityProvider, ValidationProvider } from "./CapabilityProvider";
