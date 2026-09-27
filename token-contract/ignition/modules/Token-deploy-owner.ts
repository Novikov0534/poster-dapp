import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const TOKEN_NAME = "KWNcoin";
const TOKEN_SYMBOL = "KWN";
const TOTAL_SUPPLY = 100000n * 10n ** 18n;

// ЗАМЕНИ на свой адрес из MetaMask
const NEW_OWNER = "0x86b3806052E453A5dc2b74eF23EB3c5851527B62";

export default buildModule("KWNcoin", (m) => {
  const token = m.contract("Token", [TOKEN_NAME, TOKEN_SYMBOL, TOTAL_SUPPLY]);
  m.call(token, "transferOwnership", [NEW_OWNER]);
  return { token };
});