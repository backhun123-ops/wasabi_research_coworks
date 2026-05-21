import "../src/styles.css";

export const metadata = {
  title: "Wasabi Research Coworks",
  description: "CNU-RISE wasabi tissue culture research dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
