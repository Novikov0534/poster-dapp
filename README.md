# poster-dapp — Лабораторные работы 2–4

Три приложения в одном репозитории: гостевая книга Poster, токен ERC-20 KWNcoin и токен-гейтинг (публикация только для держателей ≥ 10 KWN).

## Состав

- `poster-contract/` — Hardhat 3: Poster.sol (token-gated), Token.sol (ERC-20)
- `token-contract/` — Hardhat 3: Token.sol (лабораторная 3)
- `poster-ui/` — Next.js + viem: интерфейс Poster + Token
- `docs/` — статическая сборка для GitHub Pages

## Ссылки

- Токен KWNcoin (ERC-20):
  https://sepolia.etherscan.io/address/0xf270A22A29239eAC45Cccdb69b2539F502ab1465#code
- Poster (token-gated):
  https://sepolia.etherscan.io/address/0x0C79cE3A0f9640F33DD895D0EA07328aDCc99eC9#code
- Репозиторий:
  https://github.com/Novikov0534/poster-dapp
- Демо:
  https://novikov0534.github.io/poster-dapp/

## Запуск

Контракт Poster:

    cd poster-contract
    npm install
    npx hardhat test
    npx hardhat ignition deploy --network sepolia ignition/modules/Poster.ts

Контракт Token:

    cd token-contract
    npm install
    npx hardhat test
    npx hardhat ignition deploy --network sepolia ignition/modules/Token-deploy-owner.ts

Интерфейс:

    cd poster-ui
    npm install
    npm run dev

Открой http://localhost:3000/, подключи MetaMask (сеть Sepolia).

## Руководство пользователя

1. Открыть приложение и подключить MetaMask (сеть Sepolia).
2. Раздел **Токен KWN** показывает баланс пользователя.
   - Кнопка **Добавить KWN в MetaMask** добавляет токен в кошелёк.
   - **Перевод** отправляет токены на другой адрес.
   - Если вы владелец контракта — доступна секция **Минт**.
3. Раздел **Новая публикация** позволяет записать сообщение в блокчейн.
   - Требуется баланс ≥ 10 KWN.
   - Если токенов меньше, транзакция не отправляется, показывается предупреждение.
4. Раздел **Лента сообщений** показывает все публикации, доступен фильтр по тегу.

## Особенности

- Публикация в Poster требует ≥ 10 KWN (token-gating).
- Проверка баланса выполняется и на клиенте (для экономии газа), и в контракте (`require`).