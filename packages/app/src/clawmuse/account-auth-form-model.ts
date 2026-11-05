import type { AccountModel } from "./account-model";

export type AccountAuthMode = "login" | "register" | "recover";

interface AuthFormState {
  mode: AccountAuthMode;
  email: string;
  password: string;
  busy: boolean;
  resetSent: boolean;
  verificationSent: boolean;
  canSubmit: boolean;
  error: string | null;
  emailTouched: boolean;
  passwordTouched: boolean;
  emailError: "emailRequired" | "emailInvalid" | null;
  passwordError: "passwordRequired" | "passwordTooShort" | null;
}

export class AccountAuthFormModel {
  private state: AuthFormState = {
    mode: "login",
    email: "",
    password: "",
    busy: false,
    resetSent: false,
    verificationSent: false,
    canSubmit: false,
    error: null,
    emailTouched: false,
    passwordTouched: false,
    emailError: null,
    passwordError: null,
  };
  private listeners = new Set<() => void>();

  constructor(private readonly account: AccountModel) {
    this.state.error = account.getState().error;
  }

  getState = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  close = () => this.listeners.clear();

  private publish(patch: Partial<AuthFormState>) {
    const next = { ...this.state, ...patch };
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email.trim());
    next.emailError = null;
    if (next.emailTouched) {
      if (!next.email.trim()) next.emailError = "emailRequired";
      else if (!validEmail) next.emailError = "emailInvalid";
    }
    next.passwordError = null;
    if (next.passwordTouched && next.mode !== "recover") {
      if (!next.password) next.passwordError = "passwordRequired";
      else if (next.mode === "register" && next.password.length < 8)
        next.passwordError = "passwordTooShort";
    }
    next.canSubmit =
      !next.busy &&
      !next.resetSent &&
      !next.verificationSent &&
      validEmail &&
      (next.mode === "recover" ||
        (next.password.length > 0 && (next.mode !== "register" || next.password.length >= 8)));
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }

  setEmail = (email: string) => {
    this.account.clearError();
    this.publish({ email, resetSent: false, verificationSent: false, error: null });
  };
  setPassword = (password: string) => {
    this.account.clearError();
    this.publish({ password, error: null });
  };
  blurEmail = () => this.publish({ emailTouched: true });
  blurPassword = () => this.publish({ passwordTouched: true });
  setMode = (mode: AccountAuthMode) => {
    if (this.state.busy) return;
    this.account.clearError();
    this.publish({
      mode,
      password: "",
      resetSent: false,
      verificationSent: false,
      error: null,
      emailTouched: false,
      passwordTouched: false,
    });
  };
  submit = async () => {
    if (!this.state.canSubmit || this.account.getState().busy) return;
    const { email, password, mode } = this.state;
    this.publish({ busy: true, error: null });
    try {
      if (mode === "recover") await this.account.requestPasswordReset(email);
      else await this.account.signIn(email, password, mode === "register");
      const error = this.account.getState().error;
      this.publish({
        error,
        resetSent: mode === "recover" && error === null,
        verificationSent:
          mode === "register" && error === null && this.account.getState().account === null,
      });
    } finally {
      this.publish({ busy: false, password: "", passwordTouched: false });
    }
  };
}
