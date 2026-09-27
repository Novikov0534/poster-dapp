"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseAbi,
} from "viem";
import { sepolia } from "viem/chains";

type EthereumProvider = {
  request: (args: {
    method: string;
    params?: unknown[];
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

  return "Неизвестная ошибка. Попробуй ещё раз.";
}

const CONTRACT_ADDRESS =
  "0xAFb224B344F3d7548Cf204059FcA9802D70A3BE9" as const;

const DEPLOYMENT_BLOCK = BigInt(11794606);
const BLOCK_BATCH_SIZE = BigInt(2000);

const CONTRACT_ABI = parseAbi([
  "function post(string content, string tag)",
  "event NewPost(address indexed user, string content, string indexed tag, string tagText)",
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

  // Не даём старому запросу заменить результат более нового.
  const loadRequestId = useRef(0);

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

      // Читаем небольшими диапазонами, чтобы не запрашивать
      // всю историю одним слишком большим RPC-запросом.
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

      // Сначала показываем самые новые публикации.
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

      setFeedError(
        `Не удалось обновить историю. ${errorText(error)}`,
      );
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
    } catch (error) {
      setAddress("");
      setWalletStatus(errorText(error));
    } finally {
      setConnecting(false);
    }
  }

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

      // Получаем актуальный аккаунт перед каждой отправкой.
      const [account] = await walletClient.requestAddresses();

      if (!account) {
        throw new Error("Не выбран аккаунт MetaMask.");
      }

      setAddress(account);
      setWalletStatus("Подключено к Ethereum Sepolia.");
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

  const selectedTag = filterTag.trim();

  const visiblePosts = selectedTag
    ? posts.filter((post) => post.tag === selectedTag)
    : posts;

  const availableTags = [...new Set(posts.map((post) => post.tag))]
    .sort();

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <p className="mb-3 text-sm font-semibold text-blue-700">
          Лабораторная работа №2 · Ethereum Sepolia
        </p>

        <h1 className="text-3xl font-bold sm:text-4xl">
          Poster — гостевая книга
        </h1>

        <p className="mt-4 text-slate-600">
          Публикуйте сообщения в блокчейне и находите записи по тегам.
        </p>

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

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            Новая публикация
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            Сообщения публичны. Публикация требует комиссии
            в тестовых ETH.
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
                  <span>
                    Блок: {post.blockNumber.toString()}
                  </span>

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