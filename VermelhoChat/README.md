# Brasa

Uma plataforma comunitária em português com identidade visual própria.

## Rodar no Windows

Abra o PowerShell na pasta `NyxStudio` e entre na pasta correta do app:

```powershell
cd .\VermelhoChat
npm install
npm start
```

Abra `http://localhost:3000`, crie uma conta e depois clique no botão `+` à esquerda para criar uma comunidade. O primeiro usuário de uma comunidade é seu dono e pode criar canais e convites.

## O que funciona

- Contas com senha armazenada como hash e sessão por cookie.
- Comunidades, canais de texto e salas de voz salvos no servidor.
- Convites de comunidade com validade de sete dias.
- Mensagens diretas entre contas do Brasa.
- Chat em tempo real, indicador de digitação, presença, busca nas mensagens carregadas, reações, edição e exclusão.
- Chamadas WebRTC com grade de participantes, microfone, áudio, câmera e compartilhamento de tela, até oito participantes.
- Layout adaptado para celular e tema vermelho.

Os dados são gravados em `brasa-data.json` nesta pasta. Faça cópias desse arquivo para backup.

## Limites atuais

Esta é uma primeira versão funcional, não uma cópia completa do Discord nem pronta para hospedar uma grande comunidade. Ainda faltam anexos, bots, permissões configuráveis, moderação, recuperação de senha e autenticação de dois fatores. As sessões ativas ficam na memória do processo e terminam quando o servidor reinicia.

Para seus amigos entrarem de outras cidades, publique em um servidor com HTTPS e endereço público. O áudio usa WebRTC e STUN; algumas redes precisam de um serviço TURN. O arquivo de dados local não é compartilhado entre cópias do app, então todos precisam usar o mesmo endereço publicado.
