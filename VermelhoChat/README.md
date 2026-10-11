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

## Publicar uma versão de teste

O repositório inclui `render.yaml` na raiz para criar um serviço Node no Render. Para manter dados entre reinícios:

1. Crie um projeto Supabase e execute `supabase/schema.sql` no **SQL Editor**.
2. No Supabase, copie a **Project URL** e crie/consulte uma chave **Secret** em **Settings → API Keys**.
3. No Render, abra **Dashboard → serviço Brasa → Environment** e adicione `SUPABASE_URL` com a Project URL e `SUPABASE_SECRET_KEY` com a Secret Key. Como o serviço Render já existe, adicione-as manualmente; não coloque a chave no GitHub nem no navegador.
4. Salve as variáveis e aguarde o serviço reiniciar. Confira o log `Dados carregados do Supabase.` antes de criar a comunidade.

O app usa o banco Supabase quando essas duas variáveis estão definidas e usa o arquivo local apenas no desenvolvimento.

Depois, publique o serviço no Render e compartilhe o endereço `https://...onrender.com` com seus amigos. Todos devem criar conta no mesmo endereço. Para chamadas, cada participante precisa liberar microfone/câmera no navegador; algumas redes exigem TURN, que ainda não está configurado.

O Supabase guarda o estado do protótipo em uma linha JSONB. Isso é adequado para o teste pequeno atual, mas ainda não é um modelo escalável para uma comunidade grande nem para várias instâncias do servidor. As novas comunidades devem ser criadas após configurar o Supabase; nenhum dado local é migrado automaticamente.

## O que funciona

- Contas com senha armazenada como hash e sessão por cookie.
- Comunidades, canais de texto e salas de voz salvos no servidor.
- Convites de comunidade com validade de sete dias.
- Mensagens diretas entre contas do Brasa.
- Pedidos de amizade, lista de amigos e convite de amigos aceitos para comunidades.
- Edição do próprio nome, usuário, foto e senha nas configurações de perfil.
- Chat em tempo real, indicador de digitação, presença, busca nas mensagens carregadas, reações, edição e exclusão.
- Chamadas WebRTC com participantes identificados, microfone, áudio, câmera e compartilhamento de tela, até oito participantes; seletor de qualidade de transmissão.
- Layout adaptado para celular e tema vermelho.

Sem Supabase configurado, os dados locais são gravados em `brasa-data.json` nesta pasta. Faça cópias desse arquivo para backup.

## Limites atuais

Esta é uma primeira versão funcional, não uma cópia completa do Discord nem pronta para hospedar uma grande comunidade. Ainda faltam anexos, bots, permissões configuráveis, moderação, recuperação de senha e autenticação de dois fatores. As sessões ativas ficam na memória do processo e terminam quando o servidor reinicia.

Para seus amigos entrarem de outras cidades, publique em um servidor com HTTPS e endereço público. O áudio usa WebRTC e STUN; algumas redes precisam de um serviço TURN. O arquivo de dados local não é compartilhado entre cópias do app, então todos precisam usar o mesmo endereço publicado.
