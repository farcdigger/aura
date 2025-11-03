// Shared types for EIP-712 and traits

export interface MintAuth {
  to: string;
  payer: string;
  xUserId: string;
  tokenURI: string;
  nonce: number;
  deadline: number;
}

export type Traits = {
  description: string; // Resmin genel bir açıklaması
  main_colors: string[]; // Resimdeki baskın renkler (en fazla 3)
  style: string; // Resmin stili (örn: 'cartoon', 'photographic', 'anime', 'text logo')
  accessory: string; // Belirgin bir aksesuar (örn: 'glasses', 'hat', 'none')
};

export interface XUser {
  x_user_id: string;
  username: string;
  profile_image_url: string;
  bio?: string; // Profile bio/description
}

export interface GenerateRequest {
  x_user_id: string;
  profile_image_url: string;
  username?: string; // Optional: username for better AI analysis
  bio?: string; // Optional: profile bio for better AI analysis
}

export interface GenerateResponse {
  seed: string;
  traits: Traits;
  imageUrl: string;
  metadataUrl: string;
  preview?: string; // Base64 encoded image for immediate preview
}

export interface MintPermitRequest {
  wallet: string;
  x_user_id: string;
}

export interface MintPermitResponse {
  auth: MintAuth;
  signature: string;
}
