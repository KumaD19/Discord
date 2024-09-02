const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const connection = require('../database.js');

async function getDatabaseAlbums() {
    try {
        const [rows] = await connection.query('SELECT * FROM cards');
        return rows;
    } catch (err) {
        console.error('Error fetching albums:', err);
        return [];
    }
}

function pickAlbum(albums) {
    let randomNum = Math.random() * 100;
    let cumulativeChance = 0;

    for (let album of albums) {
        cumulativeChance += parseFloat(album.percentage);

        if (randomNum <= cumulativeChance) {
            console.log(`Album selected: ${album.name}`);
            return album;
        }
    }
    return null; 
}

async function checkUserAndCooldown(discordID, discordIDNum) {
    const [userResults] = await connection.query('SELECT id, last_generation_time FROM users WHERE discord_id_num=?', [discordIDNum]);

    if (userResults.length === 0) {
        // New user, insert them and allow immediate generation
        await connection.query('INSERT INTO users (discord_id, discord_id_num, last_generation_time) VALUES (?, ?, CURRENT_TIMESTAMP)', [discordID, discordIDNum]);
        return { isNewUser: true, remainingCooldown: 0 };
    } else {
        // Existing user, check cooldown
        const lastGenerationTime = userResults[0].last_generation_time;
        if (lastGenerationTime) {
            const currentTime = new Date();
            const timeDifference = currentTime - lastGenerationTime;
            const hoursDifference = timeDifference / (1000 * 60 * 60);

            if (hoursDifference < 6) {
                const remainingTime = Math.ceil((6 - hoursDifference) * 60);
                return { isNewUser: false, remainingCooldown: remainingTime };
            }
        }
        return { isNewUser: false, remainingCooldown: 0 };
    }
}

async function updateLastGenerationTime(discordIDNum) {
    await connection.query(
        'UPDATE users SET last_generation_time = CURRENT_TIMESTAMP WHERE discord_id_num = ?',
        [discordIDNum]
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('generar')
        .setDescription('Genera una carta'),

    async execute(interaction) {
        try {
            const discordID = interaction.user.username;
            const discordIDNum = interaction.user.id;
            
            // Check if user exists and cooldown
            const { isNewUser, remainingCooldown } = await checkUserAndCooldown(discordID, discordIDNum);

            if (!isNewUser && remainingCooldown > 0) {
                await interaction.reply(`Debes esperar ${remainingCooldown} minutos antes de generar otra carta.`);
                return;
            }

            // If not a new user, update the generation time
            if (!isNewUser) {
                await updateLastGenerationTime(discordIDNum);
            }

            const albums = await getDatabaseAlbums();
            const selectedAlbum = pickAlbum(albums);
    
            if (!selectedAlbum) {
                await interaction.reply('No se pudo seleccionar ninguna carta.');
                return;
            }
    
            const embed = new EmbedBuilder()
                .setTitle(selectedAlbum.name)
                .setDescription(selectedAlbum.description)
                .setImage(selectedAlbum.img)
                .setFooter({ text: selectedAlbum.category });

            await interaction.reply({ embeds: [embed] });

            await connection.query(
                `INSERT INTO userCards (user_id, card_id, discord_id, discord_id_num, amount)
                VALUES (
                    (SELECT id FROM users WHERE discord_id=?),
                    (SELECT id FROM cards WHERE id=?),
                    ?,
                    ?,
                    1
                )
                ON DUPLICATE KEY UPDATE amount = LEAST (amount + 1, 2)`,
                [discordID, selectedAlbum.id, discordID, discordIDNum]
            );
        } catch (error) {
            console.error('Error handling interaction:', error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply('Error al procesar la solicitud.');
            } else {
                await interaction.reply('Error al procesar la solicitud.');
            }
        }
    }
};