/**
 * Public surface of the Comptes feature. The stock page (`/titres/:ticker`)
 * mounts `<StockAccountOptions ticker={ticker} />` under a stock's details to
 * show its account options for the active profile; it imports the component
 * file directly so the lazy Comptes page stays out of its chunk.
 */
export { AccountsPage } from './AccountsPage'
export { StockAccountOptions } from './StockAccountOptions'
