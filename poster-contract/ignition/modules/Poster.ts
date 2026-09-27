import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const NEW_OWNER = "0x86b3806052E453A5dc2b74eF23EB3c5851527B62";

export default buildModule("PosterModule", (m) => {
  const poster = m.contract("Poster", [
    "0x0000000000000000000000000000000000000000",
    0n,
  ]);

  m.call(poster, "transferOwnership", [NEW_OWNER]);

  return { poster };
});