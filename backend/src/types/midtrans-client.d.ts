declare module 'midtrans-client' {
  export class Snap {
    constructor(options?: { isProduction?: boolean; serverKey?: string; clientKey?: string });
    createTransaction(parameter?: Record<string, unknown>): Promise<{ token?: string; redirect_url?: string }>;
    createTransactionToken(parameter?: Record<string, unknown>): Promise<string>;
    createTransactionRedirectUrl(parameter?: Record<string, unknown>): Promise<string>;
  }

  const midtransClient: {
    Snap: typeof Snap;
  };

  export default midtransClient;
}
