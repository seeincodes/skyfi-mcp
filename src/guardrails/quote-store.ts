interface StoredQuote {
  quoteId: string;
  tool: string;
  createdAt: number;
  expiresAt: number;
}

const QUOTE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export class QuoteStore {
  private quotes = new Map<string, StoredQuote>();

  store(quoteId: string, tool: string): void {
    const now = Date.now();
    this.quotes.set(quoteId, {
      quoteId,
      tool,
      createdAt: now,
      expiresAt: now + QUOTE_TTL_MS,
    });
    this.cleanup();
  }

  validate(quoteId: string, expectedTool: string): { valid: boolean; error?: string } {
    const quote = this.quotes.get(quoteId);

    if (!quote) {
      return { valid: false, error: `Quote ${quoteId} not found.` };
    }

    if (Date.now() > quote.expiresAt) {
      this.quotes.delete(quoteId);
      return { valid: false, error: `Quote ${quoteId} has expired. Generate a new quote.` };
    }

    if (quote.tool !== expectedTool) {
      return { valid: false, error: `Quote ${quoteId} is for ${quote.tool}, not ${expectedTool}.` };
    }

    return { valid: true };
  }

  consume(quoteId: string): void {
    this.quotes.delete(quoteId);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, quote] of this.quotes) {
      if (now > quote.expiresAt) this.quotes.delete(id);
    }
  }
}
