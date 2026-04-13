export function PricingDisclaimer() {
  const today = new Date();
  const dateStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

  return (
    <p className="text-xs text-muted-foreground leading-relaxed" data-testid="text-pricing-disclaimer">
      <span className="font-medium">Pricing as of {dateStr}</span>
      <br /><br />
      Loan programs subject to change based on market and underwriting conditions. Interest rates and other terms are subject to change with or without notice and may vary based on the credit worthiness of the borrower, property type and state, and other considerations. Loans are for investment purposes only and not for personal, family, or household use.
    </p>
  );
}
