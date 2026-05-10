import type { AppProps } from "next/app";
import Head from "next/head";
import "../app/globals.css";

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>TM2 · Take Me To Market</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Multi-agent GTM para startups" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
