export const STANDARD_LOAN_TYPES = [
  { value: "Bridge", label: "Bridge", description: "Short-term financing that bridges the gap between acquisition and permanent financing. 6-24 months." },
  { value: "Construction", label: "Construction", description: "Financing for ground-up development, renovations, or significant improvements." },
  { value: "DSCR", label: "DSCR", description: "Financing based on property's Net Operating Income rather than borrower's personal income." },
  { value: "A&D", label: "A&D", description: "Acquisition & Development financing for land acquisition and infrastructure development." },
  { value: "Fix & Flip", label: "Fix & Flip", description: "Short-term financing for purchase and renovation of properties for resale. 6-18 months." },
  { value: "Long-Term Financing", label: "Long-Term Financing", description: "Permanent mortgage financing including Fannie Mae, Freddie Mac, FHA, CMBS, portfolio. 5-30 years." },
  { value: "Land Development", label: "Land Development", description: "Financing for raw land or development projects including infrastructure and entitlements. 18-48 months." },
] as const;

export const STANDARD_PROPERTY_TYPES = [
  { value: "Residential", label: "Residential", description: "Single-family homes, townhomes, condominiums." },
  { value: "Multifamily", label: "Multifamily", description: "2-unit to high-rise apartment buildings." },
  { value: "Office", label: "Office", description: "Commercial office buildings (Class A, B, C)." },
  { value: "Retail", label: "Retail", description: "Ground-floor commercial space for retail, food, entertainment." },
  { value: "Industrial", label: "Industrial", description: "Warehouse, distribution, manufacturing, flex space." },
  { value: "Land", label: "Land", description: "Raw, undeveloped, or development-ready land." },
  { value: "Development", label: "Development", description: "Properties under development or redevelopment phase." },
  { value: "Mixed Use", label: "Mixed Use", description: "Properties combining multiple use types in one structure." },
  { value: "Hospitality", label: "Hospitality", description: "Hotels, motels, resorts, and short-term rental properties." },
  { value: "Student Housing", label: "Student Housing", description: "Purpose-built or adapted housing near universities." },
  { value: "Self-Storage", label: "Self-Storage", description: "Climate-controlled or open storage facilities." },
] as const;

export const LOAN_TYPE_VALUES = STANDARD_LOAN_TYPES.map(t => t.value);
export const PROPERTY_TYPE_VALUES = STANDARD_PROPERTY_TYPES.map(t => t.value);

export const PROPERTY_TYPE_NORMALIZATION_MAP: Record<string, string> = {
  "Hotel": "Hospitality",
  "Hotels": "Hospitality",
  "Motel": "Hospitality",
  "Resort": "Hospitality",
  "Mobile Home Park": "Residential",
  "Healthcare": "Office",
  "Medical": "Office",
  "Single Family Residence": "Residential",
  "Townhome": "Residential",
  "Condo": "Residential",
  "Agricultural": "Land",
  "Special Purpose": "Industrial",
  "Infill Lot": "Land",
  "Rental Portfolio": "Residential",
  "2-4 Unit": "Multifamily",
  "student housing": "Student Housing",
  "self-storage": "Self-Storage",
  "self storage": "Self-Storage",
  "Self Storage": "Self-Storage",
};

export const LOAN_TYPE_NORMALIZATION_MAP: Record<string, string[]> = {
  "Bridge": ["Bridge"],
  "Permanent": ["Long-Term Financing"],
  "Both": ["Bridge", "Long-Term Financing"],
  "RTL": ["Bridge", "Fix & Flip"],
  "DSCR": ["DSCR"],
  "Construction": ["Construction"],
  "Land Development": ["Land Development"],
  "A&D": ["A&D"],
  "Fix & Flip": ["Fix & Flip"],
  "Long-Term Financing": ["Long-Term Financing"],
};

export const AI_REFERENCE_KEY = `
STANDARDIZED LOAN TYPES (use these exact values):
1. Bridge - Short-term financing (6-24 months) bridging acquisition to permanent financing
2. Construction - Ground-up development, renovations, major improvements
3. DSCR - Debt Service Coverage Ratio loans based on property NOI, not borrower income
4. A&D - Acquisition & Development for land acquisition and infrastructure
5. Fix & Flip - Short-term (6-18 months) purchase and renovation for resale
6. Long-Term Financing - Permanent mortgages: Fannie Mae, Freddie Mac, FHA, CMBS, portfolio (5-30 years)
7. Land Development - Raw land or development projects (18-48 months)

STANDARDIZED PROPERTY TYPES (use these exact values):
1. Residential - Single-family homes, townhomes, condominiums
2. Multifamily - 2-unit to high-rise apartment buildings
3. Office - Commercial office buildings (Class A, B, C)
4. Retail - Shopping centers, standalone retail, strip malls
5. Industrial - Warehouse, distribution, manufacturing, flex space
6. Land - Raw, undeveloped, or development-ready land
7. Development - Properties under development or redevelopment
8. Mixed Use - Properties combining multiple use types
9. Hospitality - Hotels, motels, resorts, short-term rental properties
10. Student Housing - Purpose-built housing near universities
11. Self-Storage - Climate-controlled or open storage facilities

MATCHING RULES:
- Match deal loan_type against fund loan_types array (fund can have multiple)
- Match deal property_type against fund allowed_asset_types array (fund can have multiple)
- A null/empty loan_types on a fund means NO RESTRICTION (accepts any loan type)
- A null/empty allowed_asset_types on a fund means NO RESTRICTION (accepts any property type)
- Loan amount must fall within fund's min/max range
- Property state must be in fund's allowed_states (or fund has no state restriction)
`;
