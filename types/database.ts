export type UserRole = 'homeowner' | 'contractor' | 'admin';
export type VerificationStatus = 'pending' | 'approved' | 'rejected';
export type DocType = 'gov_id' | 'license' | 'permit' | 'other';
export type HouseType = 'one_storey' | 'two_storey' | 'townhouse';
export type WorkType = 'new_build' | 'renovation' | 'extension';
export type FinishLevel = 'basic' | 'standard' | 'premium';
export type StartWindow = 'asap' | 'in_2_months' | 'in_6_months';
export type ProjectStatus = 'draft' | 'open' | 'quoted' | 'awarded' | 'project_planning' | 'in_progress' | 'completed' | 'cancelled' | 'disputed';
export type QuoteStatus = 'requested' | 'draft' | 'submitted' | 'revision_requested' | 'revised' | 'accepted' | 'declined' | 'rejected' | 'expired' | 'withdrawn';
export type MilestoneStatus = 'locked' | 'in_progress' | 'proof_submitted' | 'payment_verification_pending' | 'approved' | 'disputed' | 'paid' | 'refunded';
export type PaymentMethod = 'gcash' | 'maya' | 'bank_transfer' | 'card';
export type PaymentStatus = 'pending' | 'held' | 'released' | 'refunded' | 'failed';
export type LedgerEntryType = 'deposit' | 'release' | 'refund' | 'fee';
export type DisputeStatus = 'open' | 'need_more_proof' | 'resolved_paid' | 'resolved_refund' | 'resolved_split' | 'resolved_fix';
export type PayoutStatus = 'pending' | 'sent' | 'failed' | 'NOT_READY' | 'PENDING' | 'PROCESSING' | 'RELEASED' | 'FAILED' | 'ON_HOLD';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  avatar_path?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractorProfile {
  profile_id: string;
  business_name: string;
  trade_name?: string | null;
  business_type?: 'sole_proprietorship' | 'partnership' | 'corporation' | string;
  authorized_representative?: string | null;
  business_email?: string | null;
  business_phone?: string | null;
  business_address?: string | null;
  province?: string | null;
  bio?: string | null;
  years_experience: number;
  service_cities: string[];
  specialties: HouseType[];
  finish_levels: FinishLevel[];
  work_types: WorkType[];
  license_no?: string | null;
  pcab_category?: string | null;
  pcab_license_no?: string | null;
  pcab_expiration_date?: string | null;
  dti_sec_no?: string | null;
  bir_tin?: string | null;
  team_capacity?: number;
  accepted_project_types?: string[];
  min_project_budget?: number;
  max_project_budget?: number;
  profile_image_path?: string | null;
  cover_image_path?: string | null;
  cover_image_position?: string | null;
  verification_status: VerificationStatus;
  verified_at?: string | null;
  verified_by?: string | null;
  rating_avg: number;
  rating_count: number;
  projects_completed: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
}

export interface ContractorDocument {
  id: string;
  contractor_id: string;
  doc_type: DocType;
  doc_title?: string | null;
  doc_number?: string | null;
  issuing_authority?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  file_path: string;
  status: VerificationStatus;
  reject_reason?: string | null;
  reviewer_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortfolioItem {
  id: string;
  contractor_id: string;
  title: string;
  description?: string | null;
  house_type?: HouseType | null;
  floors?: number | null;
  floor_area_sqm?: number | null;
  year_completed?: number | null;
  created_at: string;
  updated_at: string;
  portfolio_images?: PortfolioImage[];
}

export interface PortfolioImage {
  id: string;
  portfolio_item_id: string;
  file_path: string;
  sort_order: number;
  created_at: string;
}

export interface EstimateRate {
  id: string;
  finish_level: FinishLevel;
  work_type: WorkType;
  rate_per_sqm: number;
  extra_floor_factor: number;
  range_pct: number;
  is_active: boolean;
  effective_from: string;
  created_at: string;
  updated_at: string;
}

export interface MilestoneTemplate {
  id: string;
  seq: number;
  name: string;
  percent: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  homeowner_id: string;
  title: string;
  house_type: HouseType;
  work_type: WorkType;
  lot_area_sqm?: number | null;
  floor_area_sqm: number;
  floors: number;
  bedrooms?: number | null;
  bathrooms?: number | null;
  finish_level: FinishLevel;
  city: string;
  province?: string | null;
  floor_1_area_sqm?: number | null;
  floor_2_area_sqm?: number | null;
  structural_system?: string | null;
  site_condition?: string | null;
  roofing_type?: string | null;
  finish_specs?: Record<string, string> | null;
  scope_items?: Array<{ name: string; status: 'included' | 'excluded' | 'undecided' }> | null;
  renovation_scope?: Record<string, unknown> | null;
  extension_scope?: Record<string, unknown> | null;
  budget?: number | null;
  desired_start?: StartWindow | null;
  plan_file_path?: string | null;
  est_low?: number | null;
  est_mid?: number | null;
  est_high?: number | null;
  platform_commission_percent?: number | null;
  platform_commission_amount?: number | null;
  homeowner_total_amount?: number | null;
  estimate_confidence?: string | null;
  payment_tranches?: number | null; // Number of payments / milestones selected by homeowner (e.g. 2 to 5 payments)
  payment_terms?: string | null;
  status: ProjectStatus;
  awarded_quote_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectMatch {
  id: string;
  project_id: string;
  contractor_id: string;
  match_score: number;
  reasons: {
    specialty_score?: number;
    rating_score?: number;
    experience_score?: number;
    city_score?: number;
    summary?: string;
  };
  created_at: string;
  contractor_profile?: ContractorProfile;
}

export interface Supplier {
  id: string;
  contractor_id: string;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type MaterialCategory =
  | 'cement'
  | 'steel'
  | 'lumber'
  | 'electrical'
  | 'plumbing'
  | 'roofing'
  | 'finishing'
  | 'masonry'
  | 'aggregates'
  | 'hardware'
  | 'general'
  | 'other';

export interface MaterialQuotationItem {
  id?: string;
  code?: string;
  division?: string;
  category?: string;
  item_name: string;
  brand?: string;
  brand_spec?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total?: number;
  supplier_id?: string;
  supplier?: string;
  supplier_contact?: string;
  supplier_phone?: string;
  supplier_email?: string;
  supplier_address?: string;
  attachment_url?: string;
  price_validity?: string;
  notes?: string;
  delivery_cost?: number;
  delivery_schedule?: string;
}

export interface MaterialQuotationData {
  quote_ref?: string;
  quotation_arrangement?: 'itemized' | 'lump_sum';
  items: MaterialQuotationItem[];
  materials_subtotal: number;
  delivery_charges?: number;
  other_charges?: number;
  material_discount?: number;
  total_materials_quotation?: number;
  labor_cost: number;
  equipment_cost: number;
  logistics_cost: number;
  taxes_cost: number;
  overhead_profit_cost?: number;
  operations_subtotal: number;
  total_price: number;
  payment_terms?: string;
  procurement_timeline_days?: number;
  duration_months?: number;
  exclusions?: string;
  assumptions?: string;
  notes?: string;
  attachment_urls?: string[];
  created_at?: string;
  valid_until?: string;
}

export interface Quote {
  id: string;
  project_id: string;
  contractor_id: string;
  status: QuoteStatus;
  quote_ref?: string | null;
  quotation_arrangement?: 'itemized' | 'lump_sum';
  price: number;
  duration_months?: number | null;
  proposed_start_date?: string | null;
  materials_subtotal?: number;
  delivery_charges?: number;
  other_charges?: number;
  material_discount?: number;
  total_materials_quotation?: number;
  labor_cost?: number;
  equipment_cost?: number;
  logistics_cost?: number;
  taxes_cost?: number;
  overhead_profit_cost?: number;
  procurement_timeline_days?: number;
  notes?: string | null;
  scope_of_work?: string | null;
  work_methodology?: string | null;
  inclusions?: string | null;
  exclusions?: string | null;
  assumptions?: string | null;
  warranty_terms?: string | null;
  payment_terms?: string | null;
  breakdown?: Array<{ item: string; amount: number; description?: string }>;
  material_quotation?: MaterialQuotationData | null;
  attachment_path?: string | null;
  revision_number?: number;
  previous_quote_id?: string | null;
  revision_requested_notes?: string | null;
  revision_requested_at?: string | null;
  valid_until: string;
  requested_at: string;
  submitted_at?: string | null;
  decided_at?: string | null;
  created_at: string;
  updated_at: string;
  contractor_profile?: ContractorProfile | null;
  projects?: Project;
}

export interface Milestone {
  id: string;
  project_id: string;
  quote_id: string;
  seq: number;
  name: string;
  percent: number;
  amount: number;
  platform_commission_amount?: number;
  homeowner_total_amount?: number;
  status: MilestoneStatus;
  start_date?: string | null;
  end_date?: string | null;
  description?: string | null;
  contractor_update?: string | null;
  proof_submitted_at?: string | null;
  approve_by?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  created_at: string;
  updated_at: string;
  proofs?: MilestoneProof[];
}

export interface ProjectPlan {
  id: string;
  project_id: string;
  quote_id?: string | null;
  contractor_id?: string | null;
  homeowner_id?: string | null;
  agreed_amount: number;
  status: 'draft' | 'submitted' | 'approved' | 'revision_requested';
  submitted_at?: string | null;
  approved_at?: string | null;
  revision_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectPlanStageItem {
  id: string;
  seq: number;
  name: string;
  description: string;
  amount: number;
  percent: number;
  start_date: string;
  end_date: string;
}

export interface ProjectPlanVersion {
  id: string;
  project_plan_id: string;
  version_num: number;
  stages_data: ProjectPlanStageItem[];
  total_amount: number;
  submitted_by?: string | null;
  submitted_at: string;
}

export interface ProjectPlanComment {
  id: string;
  project_id: string;
  author_id?: string | null;
  author_name: string;
  author_role: 'contractor' | 'homeowner' | 'admin';
  message: string;
  created_at: string;
}

export interface MilestoneProof {
  id: string;
  milestone_id: string;
  uploaded_by: string;
  file_path: string;
  note?: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  project_id: string;
  quote_id: string;
  payer_id: string;
  amount: number;
  method: PaymentMethod;
  provider: string;
  provider_ref: string;
  status: PaymentStatus;
  paid_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EscrowLedger {
  id: string;
  project_id: string;
  contract_id?: string | null;
  milestone_id?: string | null;
  payment_id?: string | null;
  entry_type: LedgerEntryType;
  amount: number;
  currency?: string | null;
  from_party: string;
  to_party: string;
  note?: string | null;
  created_at: string;
}

export interface Payout {
  id: string;
  project_id?: string | null;
  contract_id?: string | null;
  contractor_id: string;
  milestone_id: string;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
  status: PayoutStatus;
  provider_ref?: string | null;
  payout_account_id?: string | null;
  payout_method?: string | null;
  transfer_proof_url?: string | null;
  transfer_proof_name?: string | null;
  payout_proof_url?: string | null;
  payout_proof_name?: string | null;
  released_by?: string | null;
  release_notes?: string | null;
  notes?: string | null;
  sent_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Dispute {
  id: string;
  milestone_id: string;
  project_id: string;
  opened_by: string;
  reason: string;
  status: DisputeStatus;
  resolution?: string | null;
  contractor_amount?: number | null;
  homeowner_amount?: number | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  contractor_fix_status?: 'fixed' | 'in_progress' | 'not_fixed' | string | null;
  contractor_fix_note?: string | null;
  contractor_fixed_at?: string | null;
  contractor_fix_proof_url?: string | null;
  contractor_fix_proofs?: Array<{ id: string; file_path: string; caption?: string; created_at?: string }>;
  created_at: string;
  updated_at: string;
}

export interface DisputeMessage {
  id: string;
  dispute_id: string;
  author_id: string;
  message: string;
  file_path?: string | null;
  created_at: string;
  author?: Profile;
}

export interface Review {
  id: string;
  project_id: string;
  homeowner_id: string;
  contractor_id: string;
  rating: number;
  comment?: string | null;
  created_at: string;
  updated_at: string;
  homeowner?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  read_at?: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id?: string | null;
  action: string;
  entity: string;
  entity_id?: string | null;
  details?: Record<string, unknown> | null;
  created_at: string;
}

export interface AppSetting {
  key: string;
  value: unknown;
  updated_at: string;
}

export type FraudReportStatus = 'pending' | 'investigating' | 'resolved_action_taken' | 'resolved_dismissed';

export interface FraudReport {
  id: string;
  reporter_id: string;
  reported_user_id?: string | null;
  project_id?: string | null;
  category: string;
  description: string;
  status: FraudReportStatus;
  investigation_notes?: string | null;
  investigated_by?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
  reporter?: Profile;
  reported_user?: Profile;
}

export type EstimateLevel = 'preliminary' | 'refined' | 'detailed' | 'quotation' | 'contract';
export type EstimateWorkCategory =
  | 'site_prep_earthworks'
  | 'concrete_works'
  | 'reinforcing_steel'
  | 'formworks'
  | 'masonry_walls'
  | 'structural_steel'
  | 'roofing_waterproofing'
  | 'doors_windows'
  | 'finishes_floor_wall'
  | 'painting'
  | 'electrical_works'
  | 'plumbing_sanitary'
  | 'mechanical_fire'
  | 'fixtures_fittings'
  | 'preliminaries_supervision';

export interface ConstructionBenchmark {
  id: string;
  project_type: WorkType;
  house_type: HouseType;
  finish_level: FinishLevel;
  region: string;
  rate_low: number;
  rate_base: number;
  rate_high: number;
  contingency_pct: number;
  contractor_overhead_profit_pct: number;
  vat_pct: number;
  source: string;
  source_notes?: string | null;
  version: string;
  effective_from: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConstructionUnitRate {
  id: string;
  category: EstimateWorkCategory;
  item_code: string;
  item_description: string;
  unit: string;
  rate_low: number;
  rate_base: number;
  rate_high: number;
  includes_labor: boolean;
  includes_material: boolean;
  includes_equipment: boolean;
  spec_standard?: string | null;
  region: string;
  source: string;
  version: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SavedEstimate {
  id: string;
  homeowner_id: string;
  project_id?: string | null;
  estimate_level: EstimateLevel;
  title: string;
  work_type: WorkType;
  house_type: HouseType;
  finish_level: FinishLevel;
  region: string;
  city: string;
  floor_area_sqm: number;
  floors: number;
  bedrooms?: number | null;
  bathrooms?: number | null;
  cost_low: number;
  cost_base: number;
  cost_high: number;
  direct_cost: number;
  overhead_profit_amt: number;
  vat_amt: number;
  contingency_amt: number;
  rate_per_sqm_base: number;
  line_items: Array<{
    item_code: string;
    description: string;
    category: string;
    quantity: number;
    unit: string;
    unit_rate: number;
    amount: number;
    spec?: string;
  }>;
  assumptions: string[];
  exclusions: string[];
  rate_version: string;
  rate_source: string;
  created_at: string;
  updated_at: string;
}

export type QuotationCategory = 'material' | 'labor' | 'equipment' | 'logistics' | 'subcontractor' | 'management_fee' | 'taxes_permits' | 'other';

export interface QuotationLineItem {
  id: string;
  quote_id: string;
  category: QuotationCategory;
  item_name: string;
  specifications?: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
  supplier?: string | null;
  delivery_cost?: number | null;
  delivery_schedule?: string | null;
  sort_order?: number;
  created_at?: string;
}

export interface ProjectAgreement {
  id: string;
  project_id: string;
  quote_id: string;
  homeowner_id: string;
  contractor_id: string;
  contract_amount: number;
  materials_subtotal: number;
  labor_other_subtotal: number;
  project_duration_months: number;
  scope_of_work?: string | null;
  inclusions?: string | null;
  exclusions?: string | null;
  warranty_terms?: string | null;
  status: 'draft' | 'pending_signatures' | 'executed' | 'terminated' | 'completed';
  homeowner_signed_at?: string | null;
  contractor_signed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractorPayoutAccount {
  id: string;
  contractor_id: string;
  payout_method: 'bank_transfer' | 'gcash' | 'maya';
  bank_name?: string | null;
  account_name: string;
  account_number_mask: string;
  account_identifier?: string | null;
  status: 'NOT_CONFIGURED' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'RESTRICTED';
  is_primary: boolean;
  verified_at?: string | null;
  verified_by?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentProviderConfig {
  id: string;
  provider_name: 'gcash' | 'maya' | 'card_gateway' | 'bank_transfer' | 'sandbox';
  display_name: string;
  is_enabled: boolean;
  environment: 'sandbox' | 'production';
  transaction_fee_pct: number;
  transaction_fee_fixed: number;
  supports_automatic_disbursement: boolean;
  metadata?: Record<string, unknown>;
  updated_by?: string | null;
  updated_at: string;
}

export interface ConfiguredPaymentMethod {
  id: string;
  code: string;
  display_name: string;
  category: 'bank_transfer' | 'ewallet' | 'qr_ph' | 'card' | 'cash_check' | 'other';
  bank_or_provider_name: string;
  account_holder_name: string;
  account_number_or_id: string;
  qr_code_url?: string | null;
  payment_instructions: string;
  min_amount?: number;
  max_amount?: number;
  transaction_fee_pct: number;
  transaction_fee_fixed: number;
  is_active: boolean;
  requires_proof: boolean;
  requires_admin_verification: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type HomeownerPaymentStatus = 'UNPAID' | 'PENDING_VERIFICATION' | 'PAID' | 'REJECTED' | 'REFUNDED' | 'DISPUTED';
export type ContractorPayoutStatus = 'NOT_READY' | 'PENDING' | 'PROCESSING' | 'RELEASED' | 'FAILED' | 'ON_HOLD';

export type GranularPaymentStatus = 'UNPAID' | 'CREATED' | 'PENDING' | 'PENDING_VERIFICATION' | 'UNDER_REVIEW' | 'PROCESSING' | 'PAID' | 'SUCCEEDED' | 'REJECTED' | 'FAILED' | 'CANCELLED' | 'REFUND_PENDING' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'DISPUTED';
export type GranularPayoutStatus = 'NOT_DUE' | 'NOT_READY' | 'PENDING_APPROVAL' | 'PENDING_PAYOUT' | 'PENDING' | 'PROCESSING' | 'RELEASED' | 'PAID' | 'FAILED' | 'ON_HOLD' | 'CANCELLED';

export interface PaymentTransactionRecord {
  id: string;
  transaction_ref: string;
  idempotency_key?: string | null;
  project_id: string;
  contract_id?: string | null;
  milestone_id?: string | null;
  milestone_approval_requested?: boolean;
  payer_id: string;
  recipient_id?: string | null;
  amount_centavos: number;
  currency: string;
  payment_method: string;
  payment_method_id?: string | null;
  provider: string;
  provider_tx_ref?: string | null;
  sender_name?: string | null;
  sender_account_identifier?: string | null;
  proof_file_url?: string | null;
  proof_file_name?: string | null;
  notes?: string | null;
  reviewer_id?: string | null;
  reviewer_notes?: string | null;
  rejection_reason?: string | null;
  verified_amount?: number | null;
  payment_status: GranularPaymentStatus;
  payout_status: GranularPayoutStatus;
  payout_tx_ref?: string | null;
  payout_account_id?: string | null;
  payout_method?: string | null;
  payout_proof_url?: string | null;
  payout_proof_name?: string | null;
  payout_released_by?: string | null;
  payout_released_at?: string | null;
  payout_notes?: string | null;
  provider_fee_centavos?: number;
  platform_fee_centavos?: number;
  net_amount_centavos?: number;
  failure_reason?: string | null;
  verified_at?: string | null;
  created_at: string;
  updated_at: string;
  projects?: Project;
  payer?: Profile;
  recipient?: Profile;
}
