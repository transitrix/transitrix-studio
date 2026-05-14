export type ProductType = 'digital_product' | 'service' | 'platform' | 'bundle';
export type ProductStatus = 'Draft' | 'Active' | 'Deprecated';

export interface Product {
  product_id: string;
  name: string;
  type: ProductType;
  status: ProductStatus;
  domain?: string;
  owner_role?: string;
  maturity?: number;
  description?: string;
  capabilities?: string[];
  processes?: string[];
  supporting_apps?: string[];
}

export interface ProductsCatalogueHeader {
  id: string;
  name: string;
  description?: string;
  version?: string;
  updated_at: string;
  products: Product[];
}

export interface ProductsCatalogueFile {
  notation: string;
  spec_version?: string;
  products_catalogue: ProductsCatalogueHeader;
}
