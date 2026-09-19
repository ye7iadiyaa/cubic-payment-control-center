export interface Account {
  id: string;
  iban: string;
  masked: string;
  currency: string;
  availableBalance: number;
  status: string;
}
