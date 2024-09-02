const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, './commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
    try {
        let command;

        if (interaction.isChatInputCommand()) {
            command = client.commands.get(interaction.commandName);
        } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
            // For button interactions, we need to get the original command
            const originalCommandName = interaction.message.interaction?.commandName;
            if (originalCommandName) {
                command = client.commands.get(originalCommandName);
            }
        }

        if (!command) {
            console.error(`No command matching ${interaction.commandName || 'unknown'} was found.`);
            return;
        }

        await command.execute(interaction);
    } catch (error) {
        console.error('Error handling interaction:', error);
        const replyContent = 'Hubo un error al procesar este comando.';
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: replyContent, ephemeral: true });
            } else {
                await interaction.reply({ content: replyContent, ephemeral: true });
            }
        } catch (replyError) {
            console.error('Error sending error reply:', replyError);
        }
    }
});

client.login(process.env.BOTTOKEN);