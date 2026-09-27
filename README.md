# poster-dapp — Лабораторная работа 2

Смарт-контракт Poster и простое dApp гостевой книги на Sepolia.

## Состав

- `poster-contract/` — Hardhat 3 + Solidity-контракт Poster
- `poster-ui/` — Next.js + web3.js интерфейс
- `docs/` — статическая сборка для GitHub Pages

## Ссылки

- Верифицированный контракт: https://sepolia.etherscan.io/address/0xAFb224B344F3d7548Cf204059FcA9802D70A3BE9#code
- Репозиторий: https://github.com/Novikov0534/poster-dapp
- Демо: https://novikov0534.github.io/poster-dapp/

## Запуск контракта

    cd poster-contract
    npm install
    npx hardhat test

## Запуск интерфейса

    cd poster-ui
    npm install
    npm run dev

Открой http://localhost:3000, подключи MetaMask (сеть Sepolia).

## Руководство пользователя

1. Открыть приложение.
2. Нажать «Connect» и подтвердить подключение в MetaMask.
3. Убедиться, что выбрана сеть Sepolia.
4. Ввести текст и тег, нажать «Post».
5. Просматривать список постов и фильтровать по тегу.