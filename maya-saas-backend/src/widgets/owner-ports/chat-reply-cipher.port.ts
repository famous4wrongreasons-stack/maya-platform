/** Text-column encryption only. No keys, identity, provider or business authority cross this port. */
export interface ChatReplyCipher {
  encrypt(plainText: string): string;
  decrypt(cipherText: string): string;
}
