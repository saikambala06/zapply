declare module "word-extractor" {
  interface WordDocument {
    getBody(): string;
    getFootnote?(): string;
    getEndnote?(): string;
    getHeader?(): string;
    getAnnotations?(): string;
  }

  interface WordExtractorOptions {
    preserveSpaces?: boolean;
  }

  class WordExtractor {
    constructor(options?: WordExtractorOptions);
    extract(input: Buffer | string): Promise<WordDocument>;
  }

  export = WordExtractor;
}
