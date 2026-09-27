import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { keccak256, stringToHex } from "viem";

describe("Poster", async function () {
  const { viem } = await network.create();

  const publicClient = await viem.getPublicClient();
  const [author] = await viem.getWalletClients();

  it("Публикует сообщение с автором и тегом", async function () {
    const poster = await viem.deployContract("Poster");

    const content = "Моя первая публикация";
    const tag = "учеба";

    const hash = await poster.write.post(
      [content, tag],
      { account: author.account },
    );

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });

    assert.equal(receipt.status, "success");

    const events = await publicClient.getContractEvents({
      address: poster.address,
      abi: poster.abi,
      eventName: "NewPost",
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
      strict: true,
    });

    assert.equal(events.length, 1);

    const published = events[0];

    assert.equal(
      published.args.user.toLowerCase(),
      author.account.address.toLowerCase(),
    );

    assert.equal(published.args.content, content);
    assert.equal(published.args.tagText, tag);

    assert.equal(
      published.args.tag,
      keccak256(stringToHex(tag)),
    );
  });
});