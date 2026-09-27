import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

describe("Token", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [creator, nonOwner] = await viem.getWalletClients();
  const creatorAddress = creator.account.address;
  const nonOwnerAddress = nonOwner.account.address;

  it("При создании выдаёт монеты создателю", async function () {
    const totalBalance = 10000n * 10n ** 18n;
    const token = await viem.deployContract("Token", [
      "HelloToken",
      "HELLO",
      totalBalance,
    ]);

    const creatorBalance = await token.read.balanceOf([creatorAddress]);
    assert.equal(creatorBalance, totalBalance);

    const deploymentBlock = await publicClient.getBlockNumber();
    const events = await publicClient.getContractEvents({
      address: token.address,
      abi: token.abi,
      eventName: "Transfer",
      fromBlock: deploymentBlock,
      strict: true,
    });

    // Один Transfer из конструктора (0x0 -> creator)
    assert.equal(events.length, 1);
    assert.equal(
      events[0].args.from,
      "0x0000000000000000000000000000000000000000",
    );
  });

  it("Владелец может чеканить. Не владелец не может", async function () {
    const totalBalance = 10000n * 10n ** 18n;
    const token = await viem.deployContract("Token", [
      "HelloToken",
      "HELLO",
      totalBalance,
    ]);

    const mintAmount = 10n * 10n ** 18n;

    // Владелец (creator) чеканит на адрес nonOwner
    const mintTxHash = await token.write.mint([nonOwnerAddress, mintAmount], {
      account: creator.account,
    });
    await publicClient.waitForTransactionReceipt({ hash: mintTxHash });

    const nonOwnerBalance = await token.read.balanceOf([nonOwnerAddress]);
    assert.equal(nonOwnerBalance, mintAmount);

    // Не владелец пытается чеканить — должна быть ошибка
    try {
      await token.write.mint([nonOwnerAddress, mintAmount], {
        account: nonOwner.account,
      });
      throw new Error("Should have thrown on non-owner mint");
    } catch (e: any) {
      assert.match(e.message, /Ownable: caller is not the owner/);
    }
  });
});