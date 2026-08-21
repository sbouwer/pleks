/**
 * lib/crypto/index.ts — the crypto barrel, narrowed to the two names anything actually imports
 *
 * Notes:  Nine further re-exports lived here (encrypt/decrypt/decryptNullable/encryptIfNeeded/
 *         isEncrypted from ./encryption, hashIdNumber/validateSAIdNumber/maskIdNumber from
 *         ./idNumber, maskBankAccount from ./bankAccount). Every caller of those imports the
 *         SUBMODULE directly, so the barrel lines were dead weight; removed 2026-08-21.
 *         Prefer the submodule import for anything new — a barrel over crypto pulls the whole
 *         directory into a caller's graph to reach one function.
 */
export { contentHash } from "./contentHash"
export { hashIp } from "./hashIp"
