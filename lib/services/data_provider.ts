export interface IDataProvider {
  name: string;
  getHistory(symbol: string, timeframe?: string, limit?: number): Promise<any[]>;
  subscribeRealtime(symbol: string, callback: (data: any) => void): void;
}
