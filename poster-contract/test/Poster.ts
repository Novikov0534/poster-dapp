import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { keccak256 } from "viem";

const THRESHOLD = 10n * 10n ** 18n;
const TOTAL_SUPPLY = 100n * 10n ** 18n;

describe("Poster", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  const creator = walletClients[0];
  const creatorAddress = creator.account.address;
  const malicious = walletClients[1];
  const maliciousAddress = malicious.account.address;

  it("post ok — у создателя достаточно токенов", async function () {
    const token = await viem.deployContract("Token", [
      "TestToken",
      "TTKN",
      TOTAL_SUPPLY,
    ]);

    const poster = await viem.deployContract("Poster", [
      token.address,
      THRESHOLD,
    ]);

    assert.equal(
      await token.read.balanceOf([creatorAddress]),
      TOTAL_SUPPLY,
    );

    const deploymentBlock = await publicClient.getBlockNumber();
    const eventsBefore = await publicClient.getContractEvents({
      address: poster.address,
      abi: poster.abi,
      eventName: "NewPost",
      fromBlock: deploymentBlock,
      strict: true,
    });
    assert.deepEqual(eventsBefore, []);

    const content = "Hello, world!";
    const tag = "hello";
    await poster.write.post([content, tag], { account: creator.account });

    const eventsAfter = await publicClient.getContractEvents({
      address: poster.address,
      abi: poster.abi,
      eventName: "NewPost",
      fromBlock: deploymentBlock,
      strict: true,
    });

    assert.equal(eventsAfter.length, 1);
    const posted = eventsAfter[0];
    assert.equal(posted.args.user.toLowerCase(), creatorAddress.toLowerCase());
    assert.equal(posted.args.content, content);
    assert.equal(posted.args.tag, keccak256(tag));
    assert.equal(posted.args.tagText, tag);
  });

  it("not enough tokens — без токенов постить нельзя", async function () {
    const token = await viem.deployContract("Token", [
      "TestToken",
      "TTKN",
      TOTAL_SUPPLY,
    ]);

    const poster = await viem.deployContract("Poster", [
      token.address,
      THRESHOLD,
    ]);

    assert.equal(
      await token.read.balanceOf([creatorAddress]),
      TOTAL_SUPPLY,
    );
    assert.equal(await token.read.balanceOf([maliciousAddress]), 0n);

    const content = "Hello, world!";
    const tag = "hello";

    try {
      await poster.write.post([content, tag], {
        account: malicious.account,
      });
      throw new Error("Should have thrown on not enough tokens");
    } catch (e: any) {
      assert.match(e.message, /Not enough tokens/);
    }
  });

  it("setThreshold — только владелец", async function () {
    const token = await viem.deployContract("Token", [
      "TestToken",
      "TTKN",
      TOTAL_SUPPLY,
    ]);

    const poster = await viem.deployContract("Poster", [
      token.address,
      THRESHOLD,
    ]);

    await poster.write.setThreshold([5n * 10n ** 18n], {
      account: creator.account,
    });

    try {
      await poster.write.setThreshold([1n], {
        account: malicious.account,
      });
      throw new Error("Should have thrown on non-owner");
    } catch (e: any) {
      assert.match(e.message, /Ownable: caller is not the owner/);
    }
  });
});