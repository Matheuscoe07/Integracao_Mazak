# MTConnect Mini UI

Interface web super simples em **HTML + CSS + TypeScript + Vite** para visualizar dados de uma máquina Mazak via protocolo **MTConnect**.

Os dados são consumidos de um endpoint XML (`/current`) e exibidos em tempo real (auto-refresh a cada 2s).

---

## ✨ Funcionalidades

- Consome dados XML de um agente MTConnect (ex.: `http://10.33.103.9:5000/current`).
- Mostra informações principais:
  - 🌡️ Temperatura do spindle
  - 📐 Ângulo C
  - ⚙️ Velocidade de rotação (RPM)
  - 🚪 Estado da porta (aberta/fechada)
  - 📍 Posição dos eixos **X** e **Z**
  - 📊 Overrides (Spindle / Feed / Rapid)
- Badges de status (Availability, Execution, Mode, Emergency Stop).
- Atualização automática a cada 2 segundos.
- Layout dark responsivo e minimalista.

---

## 📂 Estrutura
mtconnect-ui/
├─ index.html
├─ styles.css
├─ vite.config.ts
├─ tsconfig.json
├─ package.json
└─ src/
└─ main.ts

---

## 🛠️ Tecnologias

- [Vite](https://vitejs.dev/) — bundler/dev server
- [TypeScript](https://www.typescriptlang.org/)
- HTML5 + CSS3 (estilização simples e responsiva)

---

## 🚀 Como rodar em desenvolvimento

   ```bash
   git clone https://github.com/seu-usuario/mtconnect-mini-ui.git
   cd mtconnect-mini-ui
   npm install
   npm run dev
