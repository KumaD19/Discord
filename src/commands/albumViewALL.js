const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const connection = require('../database.js');

// Define icons for categories
const categoryIcons = {
    Comun: '<:pepposad:1253059533933117631>',
    Especial: '<:3_:1253060277402996788>',
    'Especial Jugador': '<a:mexicano:1252717621397291071>',
    Shiny: '<:ping:1253059493005099199>',
    Ex: '<a:emoji_34:1253473698589970523>'
};

const ITEMS_PER_PAGE = 5;
const INTERACTION_TIMEOUT = 60000; // 60 seconds

// Store active menus
const activeMenus = new Map();

async function getUserCategoryAmounts(discordID) {
    try {
        const [rows] = await connection.query(`
           SELECT 
            cards.category,
            COUNT(usercards.card_id) AS card_count
            FROM cards
            LEFT JOIN usercards
            ON cards.id = usercards.card_id
            AND usercards.discord_id_num = ?
            GROUP BY cards.category;`
        , [discordID]);
        return rows;
    } catch (error) {
        console.log(error);
        return [];
    }
}

async function getUserAlbum(discordID) {
    try {
        const [rows] = await connection.query(`
            SELECT 
            cards.name,
            cards.category,
            cards.id,
            cards.percentage,
            usercards.amount
            FROM cards
            JOIN usercards
            ON cards.id = usercards.card_id
            WHERE usercards.discord_id_num = ?`
        , [discordID]);
        return rows;
    } catch (error) {
        console.log('Error getting user albums:', error);
        return [];
    }
}

async function getUserCardsByCategory(discordID, category) {
    try {
        const [rows] = await connection.query(`
            SELECT 
            cards.name,
            cards.category,
            cards.id,
            usercards.amount
            FROM cards
            JOIN usercards
            ON cards.id = usercards.card_id
            WHERE usercards.discord_id_num = ?
            AND cards.category = ?
            ORDER BY cards.id ASC`
        , [discordID, category]);
        return rows;
    } catch (error) {
        console.log('Error fetching cards by category:', error);
        return [];
    }
}


function createCardEmbed(user, cards, page, totalPages, category) {
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const displayedCards = cards.slice(startIndex, endIndex);

    const cardEmbed = new EmbedBuilder()
        .setTitle(`Colección ${category} de ${user.username} `)
        .setDescription(`Página ${page} de ${totalPages}`)
        .setColor('#0099ff')
        .setThumbnail(user.avatarURL({ size: 2048, format: 'png' }));

    displayedCards.forEach(card => {
        cardEmbed.addFields({
            name: `ID: ${card.id}`,
            value: `**Nombre:** ${card.name}\n**Cantidad:** ${card.amount}`,
            inline: false
        });
    });

    return cardEmbed;
}

function createNavigationRow(page, totalPages, disableButtons = false) {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('first')
                .setLabel('Primera')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === 1 || disableButtons),
            new ButtonBuilder()
                .setCustomId('previous')
                .setLabel('Anterior')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === 1 || disableButtons),
            new ButtonBuilder()
                .setCustomId('next')
                .setLabel('Siguiente')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === totalPages || disableButtons),
            new ButtonBuilder()
                .setCustomId('last')
                .setLabel('Última')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === totalPages || disableButtons)
        );
    return row;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('myalbum')
        .setDescription('Muestra mi colección de cartas.'),
        

    async execute(interaction) {
        if (interaction.isStringSelectMenu()) {
            return this.handleSelectMenu(interaction);
        } else if (interaction.isButton()) {
            return this.handleButtonInteraction(interaction);
        }

        try {
            // Disable previous menu if it exists
            const previousMenu = activeMenus.get(interaction.user.id);
            if (previousMenu) {
                clearTimeout(previousMenu.timeout);
                try {
                    await previousMenu.message.edit({ components: [] });
                } catch (error) {
                    console.log('Error disabling previous menu:', error);
                }
            }

            const discordID = interaction.user.id;
            const user = interaction.user;
            const myAlbums = await getUserAlbum(discordID);

            if (myAlbums.length === 0) {
                await interaction.reply({ content: 'No tienes cartas aún. Usa el comando `/generar` para obtener tus primeras cartas.', ephemeral: true });
                return;
            }
            const getUserCategory = await getUserCategoryAmounts(discordID);
            const guild = interaction.guild;
            const guildMember = await guild.members.fetch(user.id);

            const guildMemberName = guildMember.nickname || user.username;

            const avatarFormat = user.avatar?.startsWith('a_') ? 'gif' : 'png';
            const avatarURL = user.avatarURL({ size: 2048, format: avatarFormat });

            let totalPercentage = 0;

            myAlbums.forEach(album => {
                const percentage = parseFloat(album.percentage) || 0;
                totalPercentage += percentage;
            });

            const embed = new EmbedBuilder()
                .setTitle(`${guildMemberName} (@${user.username})`)
                .setDescription(`Total de album completado (${totalPercentage.toFixed(2)}%)`)
                .setColor('#0099ff')
                .setThumbnail(avatarURL);

            getUserCategory.forEach(category => {
                const categoryIcon = categoryIcons[category.category] || 'Unknown';
                embed.addFields({
                    name: category.category,
                    value: `${categoryIcon} Cantidad: ${category.card_count}`,
                    inline: false
                });
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('myalbum_category_select')
                .setPlaceholder('Elige una opción')
                .addOptions(
                    getUserCategory.map(category => ({
                        label: category.category,
                        value: category.category
                    }))
                );

            const actionRow = new ActionRowBuilder().addComponents(selectMenu);

            const message = await interaction.reply({ embeds: [embed], components: [actionRow], fetchReply: true });

            // Set up timeout to disable the menu
            const timeout = setTimeout(async () => {
                try {
                    await message.edit({ components: [] });
                    activeMenus.delete(interaction.user.id);
                } catch (error) {
                    console.log('Error disabling menu:', error);
                }
            }, INTERACTION_TIMEOUT);

            // Store the active menu
            activeMenus.set(interaction.user.id, { message, timeout });

        } catch (error) {
            console.log('Error executing command:', error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply('Hubo un error al realizar la petición.');
            } else {
                await interaction.reply('Hubo un error al realizar la petición.');
            }
        }
    },

    async handleSelectMenu(interaction) {
        try {
            const selectedCategory = interaction.values[0];
            const discordID = interaction.user.id;
            const cards = await getUserCardsByCategory(discordID, selectedCategory);

            const totalPages = Math.ceil(cards.length / ITEMS_PER_PAGE);
            const cardEmbed = createCardEmbed(interaction.user, cards, 1, totalPages, selectedCategory);

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('myalbum_category_select')
                .setPlaceholder('Elige una opción')
                .addOptions(
                    (await getUserCategoryAmounts(discordID)).map(category => ({
                        label: category.category,
                        value: category.category
                    }))
                );

            const actionRow = new ActionRowBuilder().addComponents(selectMenu);
            const navigationRow = createNavigationRow(1, totalPages);

            const message = await interaction.update({ embeds: [cardEmbed], components: [actionRow, navigationRow], fetchReply: true });

            // Clear previous timeout and set a new one
            const previousMenu = activeMenus.get(interaction.user.id);
            if (previousMenu) {
                clearTimeout(previousMenu.timeout);
            }

            const timeout = setTimeout(async () => {
                try {
                    await message.edit({ components: [] });
                    activeMenus.delete(interaction.user.id);
                } catch (error) {
                    console.log('Error disabling menu:', error);
                }
            }, INTERACTION_TIMEOUT);

            // Store the new active menu
            activeMenus.set(interaction.user.id, { message, timeout, cards, category: selectedCategory, currentPage: 1 });

        } catch (error) {
            console.log('Error handling select menu interaction:', error);
            await interaction.reply({ content: 'Hubo un error al realizar la petición.', ephemeral: true });
        }
    },

    async handleButtonInteraction(interaction) {
        const activeMenu = activeMenus.get(interaction.user.id);
        if (!activeMenu) {
            await interaction.reply({ content: 'Expiro este menu. Utiliza el comando /myalbum de nuevo', ephemeral: true });
            return;
        }

        const { cards, category, currentPage } = activeMenu;
        const totalPages = Math.ceil(cards.length / ITEMS_PER_PAGE);
        let newPage = currentPage;

        switch (interaction.customId) {
            case 'first':
                newPage = 1;
                break;
            case 'previous':
                newPage = Math.max(1, currentPage - 1);
                break;
            case 'next':
                newPage = Math.min(totalPages, currentPage + 1);
                break;
            case 'last':
                newPage = totalPages;
                break;
        }

        const cardEmbed = createCardEmbed(interaction.user, cards, newPage, totalPages, category);
        const navigationRow = createNavigationRow(newPage, totalPages);

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('myalbum_category_select')
            .setPlaceholder('Elige una opción')
            .addOptions(
                (await getUserCategoryAmounts(interaction.user.id)).map(category => ({
                    label: category.category,
                    value: category.category
                }))
            );

        const actionRow = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.update({ embeds: [cardEmbed], components: [actionRow, navigationRow] });

        // Update the current page in the active menu
        activeMenu.currentPage = newPage;

        // Reset the timeout
        clearTimeout(activeMenu.timeout);
        activeMenu.timeout = setTimeout(async () => {
            try {
                await activeMenu.message.edit({ components: [] });
                activeMenus.delete(interaction.user.id);
            } catch (error) {
                console.log('Error disabling menu:', error);
            }
        }, INTERACTION_TIMEOUT);
    }
};