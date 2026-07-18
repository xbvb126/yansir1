export type PromptFocusTarget = { focus: () => void };

export function capturePromptTrigger(activeElement: unknown): PromptFocusTarget | null {
  if (!activeElement || typeof (activeElement as PromptFocusTarget).focus !== "function") {
    return null;
  }
  return activeElement as PromptFocusTarget;
}

export function closePromptAndRestoreFocus(onClose: () => void, target: PromptFocusTarget | null) {
  onClose();
  target?.focus();
}
