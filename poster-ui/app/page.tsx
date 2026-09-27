"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  parseAbi,
  parseUnits,
} from "viem";
import { sepolia } from "viem/chains";

type EthereumProvider = {
  request: (args: {
    method: string;
    params?: unknown;
  }) => Promise<unknown>;
};

type Post = {
  id: string;
  author: string;
  content: string;
  tag: string;
  transactionHash: string;
  blockNumber: bigint;
  logIndex: number;
};

function getProvider(): EthereumProvider | undefined {
  return (
    window as Window & {
      ethereum?: EthereumProvider;
    }
  ).ethereum;
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const anyErr = error as { message?: string; code?: number };
    if (anyErr.message) {
      return anyErr.code
        ? `${anyErr.message} (code ${anyErr.code})`
        : anyErr.message;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return "Неизвестная ошибка.";
    }
  }

  return "Неизвестная ошибка. Попробуй ещё раз.";
}

const CONTRACT_ADDRESS =
  "0x0C79cE3A0f9640F33DD895D0EA07328aDCc99eC9" as const;

const TOKEN_ADDRESS =
  "0xf270A22A29239eAC45Cccdb69b2539F502ab1465" as const;

const DEPLOYMENT_BLOCK = BigInt(11794606);
const BLOCK_BATCH_SIZE = BigInt(2000);

const CONTRACT_ABI = parseAbi([
  "function post(string content, string tag)",
  "function tokenAddress() view returns (address)",
  "function threshold() view returns (uint256)",
  "event NewPost(address indexed user, string content, string indexed tag, string tagText)",
]);

const TOKEN_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function owner() view returns (address)",
  "function mint(address account, uint256 amount)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com", {
    timeout: 20_000,
    retryCount: 1,
  }),
});

const buttonClass =
  "rounded-xl bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";

const smallButtonClass =
  "rounded-xl border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50";

const inputClass =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white p-3";

export default function Home() {
  const [address, setAddress] = useState("");
  const [walletStatus, setWalletStatus] = useState("");
  const [connecting, setConnecting] = useState(false);

  const [content, setContent] = useState("");
  const [tag, setTag] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState("");
  const [transactionHash, setTransactionHash] = useState("");

  const [posts, setPosts] = useState<Post[]>([]);
  const [filterTag, setFilterTag] = useState("");
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [feedStatus, setFeedStatus] = useState("");
  const [feedError, setFeedError] = useState("");
  const [loaded, setLoaded] = useState(false);

  // — Token state ——————————————————————————
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);
  const [tokenDecimals, setTokenDecimals] = useState<number>(18);
  const [tokenSymbol, setTokenSymbol] = useState<string>("KWN");
  const [tokenOwner, setTokenOwner] = useState<string>("");
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenStatus, setTokenStatus] = useState("");

  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferStatus, setTransferStatus] = useState("");

  const [mintTo, setMintTo] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [minting, setMinting] = useState(false);
  const [mintStatus, setMintStatus] = useState("");
  // ————————————————————————————————————————

  const loadRequestId = useRef(0);
  const tokenRequestId = useRef(0);

  // ——— Poster feed ————————————————————————
  const loadPosts = useCallback(async () => {
    const requestId = ++loadRequestId.current;

    setLoadingPosts(true);
    setFeedError("");
    setFeedStatus("Получаем историю публикаций…");

    try {
      const latestBlock = await publicClient.getBlockNumber({
        cacheTime: 0,
      });

      if (latestBlock < DEPLOYMENT_BLOCK) {
        throw new Error(
          "RPC вернул блок раньше развёртывания контракта. Повтори обновление.",
        );
      }

      const collected: Post[] = [];

      for (
        let fromBlock = DEPLOYMENT_BLOCK;
        fromBlock <= latestBlock;
        fromBlock += BLOCK_BATCH_SIZE
      ) {
        if (requestId !== loadRequestId.current) return;

        const end = fromBlock + BLOCK_BATCH_SIZE - BigInt(1);
        const toBlock = end < latestBlock ? end : latestBlock;

        setFeedStatus(
          `Читаем блоки ${fromBlock.toString()}–${toBlock.toString()}…`,
        );

        const events = await publicClient.getContractEvents({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          eventName: "NewPost",
          fromBlock,
          toBlock,
          strict: true,
        });

        for (const event of events) {
          if (
            event.transactionHash === null ||
            event.blockNumber === null ||
            event.logIndex === null
          ) {
            continue;
          }

          collected.push({
            id: `${event.transactionHash}-${event.logIndex}`,
            author: event.args.user,
            content: event.args.content,
            tag: event.args.tagText,
            transactionHash: event.transactionHash,
            blockNumber: event.blockNumber,
            logIndex: event.logIndex,
          });
        }
      }

      if (requestId !== loadRequestId.current) return;

      collected.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) {
          return a.blockNumber > b.blockNumber ? -1 : 1;
        }

        return b.logIndex - a.logIndex;
      });

      setPosts(collected);
      setLoaded(true);
      setFeedStatus(`История загружена. Публикаций: ${collected.length}.`);
    } catch (error) {
      if (requestId !== loadRequestId.current) return;

      setFeedError(`Не удалось обновить историю. ${errorText(error)}`);
      setFeedStatus("");
    } finally {
      if (requestId === loadRequestId.current) {
        setLoadingPosts(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadPosts();

    return () => {
      loadRequestId.current += 1;
    };
  }, [loadPosts]);

  // ——— Token data ——————————————————————————
  const loadTokenData = useCallback(async (userAddress: string) => {
    if (!userAddress) return;

    const requestId = ++tokenRequestId.current;
    setTokenLoading(true);
    setTokenStatus("Читаем данные токена…");

    try {
      const [balance, decimals, symbol, owner] = await Promise.all([
        publicClient.readContract({
          address: TOKEN_ADDRESS,
          abi: TOKEN_ABI,
          functionName: "balanceOf",
          args: [userAddress as `0x${string}`],
        }),
        publicClient.readContract({
          address: TOKEN_ADDRESS,
          abi: TOKEN_ABI,
          functionName: "decimals",
        }),
        publicClient.readContract({
          address: TOKEN_ADDRESS,
          abi: TOKEN_ABI,
          functionName: "symbol",
        }),
        publicClient.readContract({
          address: TOKEN_ADDRESS,
          abi: TOKEN_ABI,
          functionName: "owner",
        }),
      ]);

      if (requestId !== tokenRequestId.current) return;

      setTokenBalance(balance);
      setTokenDecimals(Number(decimals));
      setTokenSymbol(symbol);
      setTokenOwner(owner);
      setTokenStatus("");
    } catch (error) {
      if (requestId !== tokenRequestId.current) return;

      setTokenStatus(`Не удалось прочитать токен: ${errorText(error)}`);
    } finally {
      if (requestId === tokenRequestId.current) {
        setTokenLoading(false);
      }
    }
  }, []);

  // ——— Wallet ——————————————————————————————
  async function connectWallet() {
    const provider = getProvider();

    if (!provider) {
      setWalletStatus(
        "MetaMask не найден. Открой сайт в профиле браузера с установленным кошельком.",
      );
      return;
    }

    setConnecting(true);
    setWalletStatus("");

    try {
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];

      if (!accounts[0]) {
        throw new Error("Кошелёк не предоставил аккаунт.");
      }

      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }],
      });

      setAddress(accounts[0]);
      setWalletStatus("Подключено к Ethereum Sepolia.");
      await loadTokenData(accounts[0]);
    } catch (error) {
      setAddress("");
      setWalletStatus(errorText(error));
    } finally {
      setConnecting(false);
    }
  }

  // ——— Poster publish ——————————————————————
  async function publishPost() {
    const provider = getProvider();

    if (!provider) {
      setPublishStatus("MetaMask не найден.");
      return;
    }

    const message = content.trim();
    const postTag = tag.trim();

    if (!message || !postTag) {
      setPublishStatus("Заполни текст сообщения и тег.");
      return;
    }

    setPublishing(true);
    setTransactionHash("");
    setPublishStatus("Проверяем подключение и сеть…");

    let submitted = false;

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }],
      });

      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(provider),
      });

      const [account] = await walletClient.requestAddresses();

      if (!account) {
        throw new Error("Не выбран аккаунт MetaMask.");
      }

      setAddress(account);
      setWalletStatus("Подключено к Ethereum Sepolia.");
      setPublishStatus("Проверяем баланс токена…");

      // Читаем настройки Poster: какой токен и какой порог
      const [posterToken, posterThreshold] = await Promise.all([
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: "tokenAddress",
        }),
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: "threshold",
        }),
      ]);

      // Читаем баланс токена у пользователя
      const userBalance = await publicClient.readContract({
        address: posterToken,
        abi: TOKEN_ABI,
        functionName: "balanceOf",
        args: [account],
      });

      if (userBalance < posterThreshold) {
        const need = formatUnits(posterThreshold, tokenDecimals);
        const have = formatUnits(userBalance, tokenDecimals);
        setPublishStatus(
          `Недостаточно токенов ${tokenSymbol} для публикации. Нужно минимум ${need}, у тебя ${have}.`,
        );
        setPublishing(false);
        return;
      }

      setPublishStatus("Проверяем выполнение функции post…");

      const { request } = await publicClient.simulateContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "post",
        args: [message, postTag],
        account,
      });

      setPublishStatus("Подтверди публикацию в MetaMask.");

      const hash = await walletClient.writeContract(request);

      submitted = true;
      setTransactionHash(hash);
      setPublishStatus("Транзакция отправлена. Ждём подтверждение…");

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 180_000,
      });

      if (receipt.status !== "success") {
        setPublishStatus(
          "Транзакция завершилась ошибкой. Проверь её в обозревателе.",
        );
        return;
      }

      setPublishStatus("Сообщение успешно опубликовано!");
      setContent("");
      setTag("");
      setFilterTag("");

      await loadPosts();
    } catch (error) {
      if (submitted) {
        setPublishStatus(
          "Транзакция отправлена, но результат пока не получен. Проверь её по ссылке перед повторной отправкой.",
        );
      } else {
        setPublishStatus(errorText(error));
      }
    } finally {
      setPublishing(false);
    }
  }

  // ——— Token: transfer —————————————————————
  async function transferTokens() {
    const provider = getProvider();

    if (!provider) {
      setTransferStatus("MetaMask не найден.");
      return;
    }

    const to = transferTo.trim();
    const amountText = transferAmount.trim();

    if (!to || !amountText) {
      setTransferStatus("Укажи адрес получателя и сумму.");
      return;
    }

    setTransferring(true);
    setTransferStatus("Проверяем данные…");

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }],
      });

      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(provider),
      });

      const [account] = await walletClient.requestAddresses();

      if (!account) {
        throw new Error("Не выбран аккаунт MetaMask.");
      }

      const amount = parseUnits(amountText, tokenDecimals);

      if (amount <= 0n) {
        throw new Error("Сумма должна быть больше нуля.");
      }

      const { request } = await publicClient.simulateContract({
        address: TOKEN_ADDRESS,
        abi: TOKEN_ABI,
        functionName: "transfer",
        args: [to as `0x${string}`, amount],
        account,
      });

      setTransferStatus("Подтверди перевод в MetaMask.");
      const hash = await walletClient.writeContract(request);
      setTransferStatus("Транзакция отправлена. Ждём подтверждение…");

      await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 180_000,
      });

      setTransferStatus("Перевод выполнен.");
      setTransferTo("");
      setTransferAmount("");
      await loadTokenData(account);
    } catch (error) {
      setTransferStatus(errorText(error));
    } finally {
      setTransferring(false);
    }
  }

  // ——— Token: mint ————————————————————————
  async function mintTokens() {
    const provider = getProvider();

    if (!provider) {
      setMintStatus("MetaMask не найден.");
      return;
    }

    const to = mintTo.trim();
    const amountText = mintAmount.trim();

    if (!to || !amountText) {
      setMintStatus("Укажи адрес получателя и сумму.");
      return;
    }

    setMinting(true);
    setMintStatus("Проверяем данные…");

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }],
      });

      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom(provider),
      });

      const [account] = await walletClient.requestAddresses();

      if (!account) {
        throw new Error("Не выбран аккаунт MetaMask.");
      }

      const amount = parseUnits(amountText, tokenDecimals);

      if (amount <= 0n) {
        throw new Error("Сумма должна быть больше нуля.");
      }

      const { request } = await publicClient.simulateContract({
        address: TOKEN_ADDRESS,
        abi: TOKEN_ABI,
        functionName: "mint",
        args: [to as `0x${string}`, amount],
        account,
      });

      setMintStatus("Подтверди минт в MetaMask.");
      const hash = await walletClient.writeContract(request);
      setMintStatus("Транзакция отправлена. Ждём подтверждение…");

      await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 180_000,
      });

      setMintStatus("Минт выполнен.");
      setMintTo("");
      setMintAmount("");
      await loadTokenData(account);
    } catch (error) {
      setMintStatus(errorText(error));
    } finally {
      setMinting(false);
    }
  }

  // ——— Token: watchAsset (EIP-747) ——————————
  async function addTokenToWallet() {
    const provider = getProvider();
    if (!provider) {
      setTokenStatus("MetaMask не найден.");
      return;
    }

    setTokenStatus("Открываем запрос в MetaMask…");

    try {
      const result = await provider.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: {
            address: TOKEN_ADDRESS,
            symbol: tokenSymbol,
            decimals: tokenDecimals,
          },
        },
      });

      if (result) {
        setTokenStatus(`${tokenSymbol} добавлен в MetaMask.`);
      } else {
        setTokenStatus("Добавление отменено.");
      }
    } catch (error) {
      setTokenStatus(`Не удалось добавить токен: ${errorText(error)}`);
    }
  }

  const selectedTag = filterTag.trim();

  const visiblePosts = selectedTag
    ? posts.filter((post) => post.tag === selectedTag)
    : posts;

  const availableTags = [...new Set(posts.map((post) => post.tag))].sort();

  const balanceFormatted = formatUnits(tokenBalance, tokenDecimals);

  const isOwner =
    address &&
    tokenOwner &&
    address.toLowerCase() === tokenOwner.toLowerCase();

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 text-sm font-semibold text-blue-700">
          Лабораторные работы №2–4 · Ethereum Sepolia
        </p>

        <h1 className="text-3xl font-bold sm:text-4xl">
          Poster + KWNcoin
        </h1>

        <p className="mt-4 text-slate-600">
          Гостевая книга в блокчейне и собственный токен ERC-20 —
          в одном интерфейсе. Публикация требует ≥ 10 KWN.
        </p>

        {/* ——— Wallet ——————————————————————— */}
        <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">
            Подключение кошелька
          </h2>

          <button
            type="button"
            onClick={connectWallet}
            disabled={connecting || publishing}
            className={buttonClass}
          >
            {connecting
              ? "Подключение…"
              : address
                ? "Обновить подключение"
                : "Подключить MetaMask"}
          </button>

          {address && (
            <div className="mt-5">
              <p className="text-sm text-slate-500">
                Последний подключённый адрес
              </p>
              <p className="mt-1 break-all font-mono text-sm">
                {address}
              </p>
            </div>
          )}

          <p role="status" className="mt-4 break-words text-sm">
            {walletStatus}
          </p>
        </section>

        {/* ——— Token ————————————————————————— */}
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            Токен {tokenSymbol} (ERC-20)
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            Баланс, переводы и минт собственного токена.
            Контракт:{" "}
            <a
              href={`https://sepolia.etherscan.io/address/${TOKEN_ADDRESS}#code`}
              target="_blank"
              rel="noreferrer"
              className="text-blue-700 underline"
            >
              {TOKEN_ADDRESS.slice(0, 6)}…{TOKEN_ADDRESS.slice(-4)}
            </a>
          </p>

          {!address && (
            <p className="mt-4 text-sm text-slate-500">
              Подключи MetaMask, чтобы увидеть баланс и операции.
            </p>
          )}

          {address && (
            <>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <div className="rounded-xl bg-slate-50 px-4 py-3">
                  <p className="text-xs text-slate-500">Ваш баланс</p>
                  <p className="text-2xl font-semibold">
                    {balanceFormatted} {tokenSymbol}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void loadTokenData(address)}
                  disabled={tokenLoading}
                  className={smallButtonClass}
                >
                  {tokenLoading ? "Загрузка…" : "Обновить баланс"}
                </button>

                <button
                  type="button"
                  onClick={addTokenToWallet}
                  className={smallButtonClass}
                >
                  Добавить {tokenSymbol} в MetaMask
                </button>
              </div>

              <p role="status" className="mt-3 text-sm">
                {tokenStatus}
              </p>

              {/* Transfer */}
              <div className="mt-6 border-t border-slate-200 pt-5">
                <h3 className="text-lg font-semibold">Перевод</h3>

                <label className="mt-4 block text-sm font-medium">
                  Адрес получателя
                </label>
                <input
                  type="text"
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  placeholder="0x…"
                  disabled={transferring}
                  className={inputClass}
                />

                <label className="mt-4 block text-sm font-medium">
                  Сумма ({tokenSymbol})
                </label>
                <input
                  type="text"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="Например: 10"
                  disabled={transferring}
                  className={inputClass}
                />

                <button
                  type="button"
                  onClick={transferTokens}
                  disabled={transferring || !transferTo || !transferAmount}
                  className={`mt-4 ${buttonClass}`}
                >
                  {transferring ? "Отправка…" : "Перевести"}
                </button>

                <p role="status" className="mt-3 break-words text-sm">
                  {transferStatus}
                </p>
              </div>

              {/* Mint — только владельцу */}
              {isOwner && (
                <div className="mt-6 border-t border-slate-200 pt-5">
                  <h3 className="text-lg font-semibold">
                    Минт (только владелец)
                  </h3>

                  <p className="mt-1 text-xs text-green-700">
                    ✔ Вы владелец контракта токена.
                  </p>

                  <label className="mt-4 block text-sm font-medium">
                    Кому начислить
                  </label>
                  <input
                    type="text"
                    value={mintTo}
                    onChange={(e) => setMintTo(e.target.value)}
                    placeholder="0x…"
                    disabled={minting}
                    className={inputClass}
                  />

                  <label className="mt-4 block text-sm font-medium">
                    Сумма ({tokenSymbol})
                  </label>
                  <input
                    type="text"
                    value={mintAmount}
                    onChange={(e) => setMintAmount(e.target.value)}
                    placeholder="Например: 500"
                    disabled={minting}
                    className={inputClass}
                  />

                  <button
                    type="button"
                    onClick={mintTokens}
                    disabled={minting || !mintTo || !mintAmount}
                    className={`mt-4 ${buttonClass}`}
                  >
                    {minting ? "Чеканим…" : "Начеканить"}
                  </button>

                  <p role="status" className="mt-3 break-words text-sm">
                    {mintStatus}
                  </p>
                </div>
              )}
            </>
          )}
        </section>

        {/* ——— Poster publish ————————————————— */}
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            Новая публикация
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            Публикация требует минимум 10 {tokenSymbol} на балансе.
            Сообщения публичны, транзакция стоит комиссии в тестовых ETH.
          </p>

          <label
            htmlFor="post-content"
            className="mt-5 block text-sm font-medium"
          >
            Текст сообщения
          </label>

          <textarea
            id="post-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            disabled={publishing}
            maxLength={2000}
            rows={4}
            placeholder="Что хотите написать?"
            className={inputClass}
          />

          <label
            htmlFor="post-tag"
            className="mt-4 block text-sm font-medium"
          >
            Тег
          </label>

          <input
            id="post-tag"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            disabled={publishing}
            maxLength={64}
            placeholder="Например: учеба"
            className={inputClass}
          />

          <button
            type="button"
            onClick={publishPost}
            disabled={
              !address ||
              connecting ||
              publishing ||
              !content.trim() ||
              !tag.trim()
            }
            className={`mt-5 ${buttonClass}`}
          >
            {publishing ? "Публикация…" : "Опубликовать"}
          </button>

          {!address && (
            <p className="mt-3 text-sm text-slate-500">
              Для публикации подключи MetaMask.
            </p>
          )}

          <p role="status" className="mt-4 break-words text-sm">
            {publishStatus}
          </p>

          {transactionHash && (
            <a
              href={`https://sepolia.etherscan.io/tx/${transactionHash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm text-blue-700 underline"
            >
              Посмотреть транзакцию публикации
            </a>
          )}
        </section>

        {/* ——— Feed —————————————————————————— */}
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">
              Лента сообщений
            </h2>

            <button
              type="button"
              onClick={() => void loadPosts()}
              disabled={loadingPosts || publishing}
              className={buttonClass}
            >
              {loadingPosts ? "Загрузка…" : "Обновить"}
            </button>
          </div>

          <p className="mt-2 text-sm text-slate-600">
            Здесь отображаются публикации всех авторов.
            Чтение не требует подключения кошелька и оплаты газа.
          </p>

          <label
            htmlFor="filter-tag"
            className="mt-5 block text-sm font-medium"
          >
            Фильтр по точному тегу
          </label>

          <div className="flex items-center gap-2">
            <input
              id="filter-tag"
              list="known-tags"
              value={filterTag}
              onChange={(event) => setFilterTag(event.target.value)}
              placeholder="Оставь пустым, чтобы показать все записи"
              className={inputClass}
            />

            <button
              type="button"
              onClick={() => setFilterTag("")}
              className="mt-2 rounded-xl border border-slate-300 px-3 py-3 text-sm"
            >
              Сбросить
            </button>
          </div>

          <datalist id="known-tags">
            {availableTags.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>

          <p className="mt-2 text-xs text-slate-500">
            Регистр учитывается: «учеба» и «Учеба» — разные теги.
          </p>

          <p role="status" className="mt-4 text-sm text-slate-600">
            {feedStatus}
          </p>

          {feedError && (
            <p
              role="alert"
              className="mt-3 break-words rounded-xl bg-red-50 p-3 text-sm text-red-700"
            >
              {feedError}
              {loaded && " Ниже остаётся ранее загруженная история."}
            </p>
          )}

          {loaded && (
            <p className="mt-3 text-sm text-slate-500">
              Показано: {visiblePosts.length} из {posts.length}
            </p>
          )}

          {loaded && !loadingPosts && visiblePosts.length === 0 && (
            <p className="mt-5 rounded-xl bg-slate-50 p-4 text-slate-600">
              {selectedTag
                ? "Публикаций с таким тегом не найдено."
                : "Публикаций пока нет."}
            </p>
          )}

          <div className="mt-5 space-y-4">
            {visiblePosts.map((post) => (
              <article
                key={post.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <button
                  type="button"
                  onClick={() => setFilterTag(post.tag)}
                  title="Показать сообщения с этим тегом"
                  className="max-w-full break-all rounded-lg bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700"
                >
                  #{post.tag}
                </button>

                <p className="mt-3 whitespace-pre-wrap break-words">
                  {post.content}
                </p>

                <p className="mt-4 text-xs text-slate-500">
                  Автор
                </p>

                <a
                  href={`https://sepolia.etherscan.io/address/${post.author}`}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono text-xs text-blue-700 underline"
                >
                  {post.author}
                </a>

                <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                  <span>Блок: {post.blockNumber.toString()}</span>

                  <a
                    href={`https://sepolia.etherscan.io/tx/${post.transactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 underline"
                  >
                    Транзакция
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <a
          href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}#code`}
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-block text-sm text-blue-700 underline"
        >
          Посмотреть контракт Poster
        </a>
      </div>
    </main>
  );
}