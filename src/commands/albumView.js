const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const connection = require('../database.js'); 

async function getUserAlbum(discordIDNum, albumId = null) {
    try {
        let query = `
            SELECT 
            cards.id, cards.name, cards.img, cards.description, cards.category 
            FROM cards 
            JOIN usercards
            ON cards.id = usercards.card_id 
            WHERE usercards.discord_id_num = ?
        `;
        const params = [discordIDNum];

        if (albumId !== null) {
            query += ' AND cards.id = ?';
            params.push(albumId);
        }

        const [rows] = await connection.query(query, params);
        return rows;    
        
    } catch (error) {
        console.log('Error getting user albums', error);
        return [];
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mostrar')
        .setDescription('Consulta todas las cartas disponibles o elige una específica.')
        .addIntegerOption(option => 
            option.setName('album_id')
                .setDescription('Introduce el ID de la carta que quieres ver:')
                .setRequired(false)),

    async execute(interaction) {
        try {
            const discordIDNum = interaction.user.id;
            let albumId, albums, currentIndex;

            if (interaction.isChatInputCommand()) {
                albumId = interaction.options.getInteger('album_id');
                albums = await getUserAlbum(discordIDNum, albumId);
                currentIndex = 0;
            } else if (interaction.isButton()) {
                const [action, index] = interaction.customId.split(':');
                currentIndex = parseInt(index);
                albums = await getUserAlbum(discordIDNum);
                
                if (action === 'prev') {
                    currentIndex = (currentIndex - 1 + albums.length) % albums.length;
                } else if (action === 'next') {
                    currentIndex = (currentIndex + 1) % albums.length;
                }
            }

            if (albums.length === 0) {
                const replyContent = albumId ? "Todavía no tienes cartas a disposición." : "Todavía no tienes cartas a disposición.";
                await interaction.reply({ content: replyContent, ephemeral: true });
                return;
            }

            function createAlbumEmbed(album) {
                return new EmbedBuilder()
                    .setTitle(album.name)
                    .setDescription(album.description)
                    .setImage(album.img)
                    .setFooter({ text: `Categoria: ${album.category} | ID: ${album.id}` });
            }

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`prev:${currentIndex}`)
                        .setLabel('Previous')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`next:${currentIndex}`)
                        .setLabel('Next')
                        .setStyle(ButtonStyle.Primary)
                );

            const embed = createAlbumEmbed(albums[currentIndex]);
            const messageOptions = { embeds: [embed], components: albums.length > 1 ? [row] : [] };

            if (interaction.isChatInputCommand()) {
                await interaction.reply(messageOptions);
            } else if (interaction.isButton()) {
                await interaction.update(messageOptions);
            }

        } catch (error) {
            console.error('Error in show command:', error);
            const replyContent = 'Error al procesar este comando.';
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: replyContent, ephemeral: true });
            } else {
                await interaction.reply({ content: replyContent, ephemeral: true });
            }
        }
    }
};