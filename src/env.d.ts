interface Window {
  dataLayer: unknown[];
  gtag?: (...args: unknown[]) => void;
}

interface ImportMetaEnv {
  /** Firestore project for 奶娃追蹤, from the deploy workflow's variables. */
  readonly PUBLIC_NAIWA_PROJECT?: string;
  /** The Firebase web app's API key, for anonymous sign-in. */
  readonly PUBLIC_NAIWA_API_KEY?: string;
}
