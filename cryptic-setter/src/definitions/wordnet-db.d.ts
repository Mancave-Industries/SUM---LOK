// wordnet-db ships no type declarations of its own — this is the minimal
// shape wordnetSync.ts actually uses.
declare module 'wordnet-db' {
  const wordnetDb: {
    path: string;
    version: string;
    libVersion: string;
    files: string[];
  };
  export default wordnetDb;
}
