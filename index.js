process.env.NTBA_FIX_319 = 1;
const fs = require('fs');
const express=require('express');
const app=express();
const TelegramBot = require('node-telegram-bot-api'); //inizializzazione bot
const token = '1003123688:AAF3QGBhFiR8n9joWefQUv8qIza8ULo5plE';
const axios = require('axios'); //pacchetto utilizzato per effetturare le chiamate GET
const Database = require('better-sqlite3');
const bot = new TelegramBot(token, {
    polling: true
});
app.listen(process.env.PORT, function () {
    console.log('listening on port! '+process.env.PORT);
  });
app.get('/',function(req,res){
res.send("The bot is up!"); //utilizzo express per effettuare richieste periodiche http per tenere 'in vita' il bot
});
axios.default.defaults.timeout = 20000; //dopo 20 secondi preferisco che si generi un'eccezione e che l'utente possa provare ad eseguire un'altra chiamata
bot.onText(/\/mostwatched/, function (msg, match) {

    MostPopular(stateValue(msg.chat.id,"mostpopularpage"), function (keyboard) { //==>>>> chiamo la funzione che mi mostra le serie più guardate e aspetto 
        //il valore di ritorno keyboard(oggetto InlineKeyboardButton[][]) in una callback

        bot.sendMessage(msg.chat.id, "Select a series for more info!", {
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    });


});
bot.onText(/\/myseries/, function (msg, match) {

    MySeries(msg.chat.id, stateValue(msg.chat.id,"myseriespage"), function (keyboard, err) { //==>>>> chiamo la funzione che mi mostra le serie che seguo personalmente 

        //e aspetto il valore di ritorno keyboard(oggetto InlineKeyboardButton[][]) in una callback. Se presente il valore 'err', non seguo nessuna serie

        if (err) {
            bot.sendMessage(msg.chat.id, "You are not following any series!");
        } else {
            bot.sendMessage(msg.chat.id, "Select a series to note down an episode!", {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }).then(message=>{
                stateValue(msg.chat.id,"mylastseries",message.message_id); //mi serve sapere l'id dell'utlimo messaggio che mostra le serie seguite cosicchè nel caso 
                //in cui io smettessi di seguire una serie, potessi direttamente aggiornare il messaggio con questo id
            }).catch(error=>{console.error(error)});
        }
    });

});

bot.onText(/\/start/, function (msg, match) {

   setState(msg.chat.id);
    
    bot.sendMessage(msg.chat.id, "Welcome to this bot! \n Try out the commands and enjoy!"); //messaggio di benvenuto

});

bot.onText(/\/search (.+)/, (msg, match) => {

    var searched = match[1]; //parola cercata
    stateValue(msg.chat.id,"searched",searched); //inizializzo l'ultima parola cercata dall'utente
    SearchByName(searched, 1,
        function (keyboard, err) { //==>>>> chiamo la funzione che mi mostra le serie che ho cercato 

            //e aspetto il valore di ritorno keyboard(oggetto InlineKeyboardButton[][]) in una callback. Se presente il valore 'err', non è stato trovato alcun risultato
            if (err) {
                bot.sendMessage(msg.chat.id, "No results found for " + searched);
            } else {

                bot.sendMessage(msg.chat.id, "Select a series for more info!", {
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            }

        });
});

bot.on("callback_query", (callbackQuery) => { //l'intera applicazione si basa sull'utilizzo di bottoni in-line che 'contengono' dei 'callback_data' e quando vengono premuti, l'evento viene 
    //gestito in questo listener
    var msg = callbackQuery.message; //messaggio contenente i tasti che hanno fatto scaturire l'evento
    var data = callbackQuery.data; //dati 'contenuti' nei bottoni
    var chatId = msg.chat.id; //id della chat 

    if (data.includes("seriesinfo")) { //i dati contengono la parola 'seriesinfo' quando si preme su un bottone all'interno di una lista di serie (famose/cercate/seguite)
        let seriesId = data.split(':')[1]; //le 'callback_data' sono formate in questo modo: "funzioneInteressata:idDellaSerie"
        let section = data.split(':')[0];
        switch (section) {
            case "seriesinfodetails": { //siamo nel caso in cui è stato premuto su un bottone all'interno della lista di serie famose oppure all'interno della lista di serie cercate

                bot.answerCallbackQuery(callbackQuery.id).then(SeriesInfoDetails(seriesId, chatId, function (infoKB, image, captionText) {
                    //dico all'interfaccia che sto 'rispondendo' alla callback, quindi chiamo la funzione che mi ritorna i dettagli di una serie sempre all'interno di una callback 
                    //sotto forma di InlineKeyboardButton[][], l'url di un'immagine e il contenuto del testo come descrizione all'immagine 
                    bot.sendPhoto(chatId, image, {
                        caption: captionText,
                        parse_mode: "HTML",
                        reply_markup: {
                            inline_keyboard: infoKB
                        }
                    }).catch(error => { //l'api non è perfetta (è gratuita e non le se può chiedere di più) e presenta alcuni errori. In questo caso l'url dell'immagine non aveva l'estensione,
                        //pertanto si utilizza una 'no-image'

                        bot.sendPhoto(chatId, "https://static.episodate.com/images/no-image.png", {
                            caption: captionText,
                            parse_mode: "HTML",
                            reply_markup: {
                                inline_keyboard: infoKB
                            }
                        });
                    });

                }));
            }


            break;
        case "seriesinfoepisodes": { //siamo nel caso in cui è stato premuto su un bottone all'interno della lista di delle serie seguite
            bot.answerCallbackQuery(callbackQuery.id).then(function(){
                
                let info = SeriesInfoEpisodes(seriesId, chatId); //prendiamo dal database le informazioni riguardo gli appunti presi 
                //il valore di ritorno(array) contiene il messaggio da mandare e l'oggetto di tipo InlineKeyboardButton[][]
                
                bot.sendMessage(chatId, info[0], {
                    reply_markup: {
                        inline_keyboard: info[1]
                    }
                });
            })
            }
        break;
        }

    }
    if (data.includes("back")) { //i dati contengono la parola 'back' se è stato premuto sul bottone 'Back', indifferentemente dall'interfaccia di 'partenza'

        bot.answerCallbackQuery(callbackQuery.id).then(bot.deleteMessage(chatId, msg.message_id));
        //dico all'interfaccia che sto 'rispondendo' alla callback, quindi cancello il messaggio dove era incorporato il tasto 'Back'
        //in questo modo viene mostrato più chiaramente il messaggio precedente e si ha la sensazione di essere tornati indietro

    }

    if (data.includes("followseries")) { //i dati contengono la parola 'followseries' se è stato premuto sul bottone 'Follow' all'interno dell'interfaccia che mostra i dettagli di una serie
    //oppure se è stato premuto il bottone 'Unfollow' all'interno del messaggio che mostra gli appunti di una serie che si segue
    let section=data.split(':')[0]; //la 'callback_data' è formata in questo modo: "funzioneInteressata:idDellaSerie;nomeDellaSerie"
    switch (section) {
    case "followseries":
        {
            var info = data.split(':')[1]; 
            var seriesId = info.split(';')[0];
            var seriesName = info.split(';')[1]; //il nome della serie serve nella funzione FollowSeries (aggiunta al database). Inutile effettuare una'altra richiesta GET soltanto per avere il nome
            var changes = FollowSeries(seriesName, seriesId, chatId); //questa funzione ritorna il numero di righe modificate (in questo caso dovrebbe essere sempre 1)
            if (changes == 1) {
    
                bot.answerCallbackQuery(callbackQuery.id).then(bot.editMessageReplyMarkup({
                    //dico all'interfaccia che sto 'rispondendo' alla callback e utilizzo una funzione per modificare il messaggio che conteneva il bottone 'Follow'
                    //in questo modo quel messaggio che prima conteneva le informazioni di una serie, un tasto 'Back' e un tasto 'Follow', ora non contiene più quest'ultimo tasto 
                    inline_keyboard: [
                        [{
                            text: "Back",
                            callback_data: "back"
                        }]
                    ]
                }, {
                    chat_id: chatId,
                    message_id: msg.message_id
                }).catch(err=>{console.error(err);})).then(function(){
                    //controllo se nello stato delle variabili, il parametro 'mylastseries' (id dell'ultimo messaggio mostrato con le serie seguite ) ha valore
                    let mylastseries=stateValue(chatId,"mylastseries");  
                     
                    //se è così, modifico quel messaggio in modo che l'interfaccia si aggiorni quando aggiungo una nuova serie
                    if(mylastseries)
                    {
                    MySeries(chatId, 1, function (keyboard) {
                    //dico all'interfaccia che sto 'rispondendo' alla callback e utilizzo una funzione per modificare il messaggio che conteneva le serie seguite
                    //in questo modo quel messaggio si aggiorna in modo che mostri anche la nuova serie che ho aggiunto
                    //viene passata come pagina da mostrare la prima, in quanto le serie sono mostrate in ordine decrescente (della data) di aggiunta/modifica
                    //i bottoni aggiornati verranno creati nella funzione MySeries che ritorna l'oggetto InlineKeyboardButton[][]

                    stateValue(chatId,"myseriespage",1); //aggiorno lo stato del numero della pagina 
                    
                    bot.editMessageReplyMarkup({   
                        inline_keyboard: keyboard
                    }, {
                        chat_id: chatId,
                        message_id: stateValue(chatId,"mylastseries")
                    }).catch(err=>{console.error(err);});

                });
            }
            
            });
    
            } else {
                bot.sendMessage(chatId, "A problem has occurred"); //se non c'è alcun cambiamento, invia un avviso
            }
        }
        break;

        case "unfollowseries":
            {
               
                var seriesId = data.split(':')[1];//la 'callback_data' è formata in questo modo: "funzioneInteressata:idDellaSerie"
                var changes = UnfollowSeries(seriesId,chatId); //questa funzione ritorna il numero di righe modificate (in questo caso dovrebbe essere sempre 1)
                if (changes == 1) {
        
                    bot.answerCallbackQuery(callbackQuery.id).then(MySeries(chatId, 1, function (keyboard) {
                        //dico all'interfaccia che sto 'rispondendo' alla callback e utilizzo una funzione per modificare il messaggio che conteneva le serie seguite
                        //in questo modo quel messaggio si aggiorna in modo che non mostri più la serie eliminata
                        //viene passata come pagina da mostrare la prima, in quanto non si sa se dopo aver cancellato una serie, esistano più pagine (inutile effettuare altri controlli)
                        //i bottoni aggiornati verranno creati nella funzione MySeries che ritorna l'oggetto InlineKeyboardButton[][]

                        stateValue(chatId,"myseriespage",1); //aggiorno lo stato del numero della pagina 

                         //cancello il messaggio con il tasto 'unfollow' perchè non serve più
                        bot.deleteMessage(chatId,msg.message_id).then( 
                        bot.editMessageReplyMarkup({   
                            inline_keyboard: keyboard
                        }, {
                            chat_id: chatId,
                            message_id: stateValue(chatId,"mylastseries")
                        })).catch(err=>{console.error(err);});
    
                    }));
        
                } else {
                    bot.sendMessage(chatId, "A problem has occurred"); //se non c'è alcun cambiamento, invia un avviso
                }
            }
            break;
}
    
    }

    if (data.includes("nextpage")) { //i dati contengono la parola 'nextpage' se è stato premuto sul bottone 'Next' nelle interfacce contenenti liste

        switch (data) {
            case "nextpagemyseries": { //è stata cambiata la pagina all'interno della lista contenente le serie seguite

                let page = stateValue(chatId,"myseriespage",'+');
                
                
                bot.answerCallbackQuery(callbackQuery.id).then(MySeries(chatId, page, function (keyboard) {
                    //dico all'interfaccia che sto 'rispondendo' alla callback e utilizzo una funzione per modificare il messaggio che conteneva le serie seguite
                    //in questo modo quel messaggio si aggiorna e mostra le prossime serie (max 20 per pagina)
                    //i bottoni aggiornati verranno creati nella funzione MySeries che ritorna l'oggetto InlineKeyboardButton[][]

                    bot.editMessageReplyMarkup({
                        inline_keyboard: keyboard
                    }, {
                        chat_id: chatId,
                        message_id: msg.message_id
                    }).catch(err=>{console.error(err);});

                }));
            }
            break;

        case "nextpagemostpopular": { //è stata cambiata la pagina all'interno della lista contenente le serie più famose
            let page = stateValue(chatId,"mostpopularpage",'+');

            bot.answerCallbackQuery(callbackQuery.id).then(MostPopular(page, function (keyboard) {
                //dico all'interfaccia che sto 'rispondendo' alla callback e utilizzo una funzione per modificare il messaggio che conteneva le serie più famose
                //in questo modo quel messaggio si aggiorna e mostra le prossime serie (max 20 per pagina)
                //i bottoni aggiornati verranno creati nella funzione MostPopular che ritorna l'oggetto InlineKeyboardButton[][]. 
                bot.editMessageReplyMarkup({
                    inline_keyboard: keyboard
                }, {
                    chat_id: chatId,
                    message_id: msg.message_id
                }).catch(err=>{console.error(err);});
            }));
        }
        break;

        case "nextpagesearchbyname": { //è stata cambiata la pagina all'interno della lista contenente le serie cercate
            let page = stateValue(chatId,"searchbynamepage",'+');
            let searched = stateValue(chatId,"searched");
            bot.answerCallbackQuery(callbackQuery.id).then(SearchByName(searched, page, function (keyboard) {
                //dico all'interfaccia che sto 'rispondendo' alla callback e utilizzo una funzione per modificare il messaggio che conteneva le serie cercate
                //in questo modo quel messaggio si aggiorna e mostra le prossime serie (max 20 per pagina)
                //i bottoni aggiornati verranno creati nella funzione SearchByName che ritorna l'oggetto InlineKeyboardButton[][]

                bot.editMessageReplyMarkup({
                    inline_keyboard: keyboard
                }, {
                    chat_id: chatId,
                    message_id: msg.message_id
                }).catch(err=>{console.error(err);});

            }));
        }

        break;
        }
    }

    if (data.includes("prevpage")) { //i dati contengono la parola 'prevpage' se è stato premuto sul bottone 'Prev', nelle interfacce contenenti liste

        switch (data) {
            case "prevpagemyseries": { //è stata cambiata la pagina all'interno della lista contenente le serie seguite
                let page = stateValue(chatId,"myseriespage",'-');

                bot.answerCallbackQuery(callbackQuery.id).then(MySeries(chatId, page, function (keyboard, err) {
                    //dico all'interfaccia che sto 'rispondendo' alla callback e utilizzo una funzione per modificare il messaggio che conteneva le serie seguite
                    //in questo modo quel messaggio si aggiorna e mostra le prossime serie (max 20 per pagina)
                    //i bottoni aggiornati verranno creati nella funzione MySeries che ritorna l'oggetto InlineKeyboardButton[][]

                    bot.editMessageReplyMarkup({
                        inline_keyboard: keyboard
                    }, {
                        chat_id: chatId,
                        message_id: msg.message_id
                    }).catch(err=>{console.error(err);});

                }));
            }
            break;

        case "prevpagemostpopular": { //è stata cambiata la pagina all'interno della lista contenente le serie più famose
            let page =  stateValue(chatId,"mostpopularpage",'-');

            bot.answerCallbackQuery(callbackQuery.id).then(MostPopular(page, function (keyboard) {
                //dico all'interfaccia che sto 'rispondendo' alla callback e utilizzo una funzione per modificare il messaggio che conteneva le serie più famose
                //in questo modo quel messaggio si aggiorna e mostra le prossime serie (max 20 per pagina)
                //i bottoni aggiornati verranno creati nella funzione MostPopular che ritorna l'oggetto InlineKeyboardButton[][]. 
                bot.editMessageReplyMarkup({
                    inline_keyboard: keyboard
                }, {
                    chat_id: chatId,
                    message_id: msg.message_id
                }).catch(err=>{console.error(err);});
            }));
        }

        break;

        case "prevpagesearchbyname": { //è stata cambiata la pagina all'interno della lista contenente le serie cercate
            let page =  stateValue(chatId,"searchbynamepage",'-');
            let searched = stateValue(chatId,"searched");

            bot.answerCallbackQuery(callbackQuery.id).then(SearchByName(searched, page, function (keyboard) {
                //dico all'interfaccia che sto 'rispondendo' alla callback e utilizzo una funzione per modificare il messaggio che conteneva le serie cercate
                //in questo modo quel messaggio si aggiorna e mostra le prossime serie (max 20 per pagina)
                //i bottoni aggiornati verranno creati nella funzione SearchByName che ritorna l'oggetto InlineKeyboardButton[][]
                bot.editMessageReplyMarkup({
                    inline_keyboard: keyboard
                }, {
                    chat_id: chatId,
                    message_id: msg.message_id
                }).catch(err=>{console.error(err);});

            }));
        }

        break;
        }
    }
    if (data.includes("seriesnotes")) { //i dati contengono la parola 'seriesnotes' quando si preme su un bottone "Add notes" oppure "Update notes" all'interno dell'interfaccia che mostra 
//gli appunti presi per una serie 
        let seiresInfo = data.split(':')[1];
        let seriesId=seiresInfo.split(';')[0];
        let seriesName=seiresInfo.split(';')[1];

        bot.answerCallbackQuery(callbackQuery.id).then(bot.sendMessage(chatId, "Insert your notes:", {
            //dico all'interfaccia che sto 'rispondendo' alla callback, quindi invio un messaggio che invita l'utente a scrivere i suoi appunti
            //attraverso il parametro 'force_reply', il prossimo messaggio sell'utente sarà una replica al messaggio precedentemente inviato dal bot. Questo è utile nella funzione sotto 
            reply_markup: {
                force_reply: true
            }

        }).then(function (sended) {
            bot.onReplyToMessage(chatId, sended.message_id, function (message) {
                //quando l'utente risponde al messaggio del bot, viene chiamata la funzione UpdateSeriesNotes che aggiorna/aggiunge degli appunti (nel database)
                let changes = UpdateSeriesNotes(chatId, seriesId, message.text);
                if (changes == 1) {
                    bot.deleteMessage(chatId, message.message_id);
                    bot.deleteMessage(chatId, sended.message_id);
                    //se ci sono cambiamenti, viene cancellato sia il messaggio di 'richiesta' di appunti del bot sia la risposta dell'utente per tenere la chat più 'pulita'
                  
                        msg.reply_markup.inline_keyboard[1][0].text="Update your episodes notes"; //per evitare di effettuare altre query per aggiornare l'interfaccia, visto che abbiamo la certezza
                       msg.text= "The next episode of " + seriesName + " you have to watch is: " + message.text; //che l'operazione è andata a buon fine (changes è uguale a 1), modifichiamo il vecchio messaggio
                       
                       bot.editMessageText(msg.text, {
                            chat_id: chatId,
                            message_id: msg.message_id,
                            reply_markup: {
                                inline_keyboard: msg.reply_markup.inline_keyboard
                            }
                        }).catch(err=>{console.error(err);});
                }

            });
        }));
    }
});

bot.on("polling_error",function(err)
{
    console.error(err);
});

function SeriesInfoDetails(id, chatId, callback) { //funzione che mostra i dettagli di una serie 


    var json;
    axios.get("https://www.episodate.com/api/show-details?q=" + id)
        .then(response => {
            json = response.data;
            var description = json.tvShow.description ? replaceAll(((json.tvShow.description)), /<br\s*[\/]?>/gi, "").substring(0, 400) + "..." : " ";
            //<br> non è un tag supportato da telegram e l'api potrebbe ritornare questo tag nella descrizione. Inoltre vengono considerati solo i primi 400 caratteri perché il 'caption' 
            //di una fota ha un limite di byte
            var seasons = json.tvShow.episodes.length != 0 ? json.tvShow.episodes[json.tvShow.episodes.length - 1].season : " ";
            var genre = " ";
            json.tvShow.genres ? json.tvShow.genres.forEach(element => {
                genre += element + ";";
            }) : " ";

            var airdate = json.tvShow.start_date ? json.tvShow.start_date : " ";
            var network = json.tvShow.network ? json.tvShow.network : " ";
            var status = json.tvShow.status ? json.tvShow.status : " ";
            var url = json.tvShow.url ? "<a href='" + json.tvShow.url + "'>" + json.tvShow.url + "</a>" : " ";
            //vengono utilizzati gli operatori ternari per controllare se è presente il campo (ricordo che l'API è gratuita), altrimenti la stringa è vuota (per non mostrare 'undefined')
            var captionText =     //creo il testo della 'caption' (descrizione della foto)
                "<b>Description: </b>" + description + "\n" +
                "<b>Genre: </b>" + genre + "\n" +
                "<b>Seasons: </b>" + seasons + "\n" +
                "<b>Air Date: </b>" + airdate + "\n" +
                "<b>Network: </b>" + network + "\n" +
                "<b>Status: </b>" + status +
                "...\nFor more info: " + url;
            
            var image = json.tvShow.image_thumbnail_path ? json.tvShow.image_thumbnail_path : "https://static.episodate.com/images/no-image.png";
            //l'api potrebbe tornare un campo vuoto (e qui viene gestito questo evento) oppure tornare un link non valido (per esempio https://sitoweb.com/immagine.  ->senza estensione)
            //quest'ultimo evento viene gestito come visto sopra quando viene chiamato il metodo bot.sendPhoto
            var infoKB;
            if (isWatchingSeries(chatId, id) == false) { //se sto già seguendo questa serie, non verrà mostrato il tasto 'Follow'
                infoKB = [
                    [{
                            text: "Back",
                            callback_data: "back"
                        },
                        {
                            text: "Follow",
                            callback_data: "followseries:" + id + ";" + replaceAll(json.tvShow.name, ":", "").substring(0, 64)
                        }
                    ]
                ];
            } else {
                infoKB = [
                    [{
                        text: "Back",
                        callback_data: "back"
                    }]
                ];
            }

            callback(infoKB, image, captionText);//infine passo i valori alla funzione callback
        })
        .catch(error => {
            console.log(error);
        });
}

function replaceAll(str, search, replace) { //sostituisce tutte le occorrenze di una parola con un'altra
    return str.split(search).join(replace);
}

function FollowSeries(seriesname, seriesid, chatId) { //funzione che aggiunge un valore al campo 'nextEpisode' (inizialmente nullo) interpretato come 'appunti'
    let db = new Database('./myseries.db');

    //let current_datetime = new Date();
   // let formatted_date = current_datetime.getFullYear() + "-" + (current_datetime.getMonth() + 1) + "-" + current_datetime.getDate() + " " + current_datetime.getHours() + ":" + current_datetime.getMinutes() + ":" + current_datetime.getSeconds(); 

    let query = db.prepare("INSERT INTO `watchedseries` (chatId, seriesId, seriesName, nextEpisode, lastUpdate) VALUES(?,?,?,?,?)");
    let info = query.run(chatId, seriesid, seriesname, null, "4");
    db.close();

    return info.changes; //ritorno il numero delle modifiche (anche se ho inserito lo stesso valore, è considerato cambiamento)
}

function UnfollowSeries(seriesId,chatId)
{
    let db = new Database('./myseries.db');

    let query = db.prepare("DELETE FROM watchedseries WHERE seriesId=? AND chatId=?");
    let info = query.run(seriesId, chatId);
    db.close();

    return info.changes; //ritorno il numero delle modifiche (anche se ho inserito lo stesso valore, è considerato cambiamento)
}

function isWatchingSeries(chatId, seriesId) { //funzione che verifica se un utente segue già una serie oppure no. Utile per sapere se mostrare il tasto 'Follow'
    let db = new Database('./myseries.db');

    let query = db.prepare("SELECT seriesName FROM watchedseries WHERE chatId=? AND seriesId=?");
    let info = query.get(chatId, seriesId);
    db.close();
    if (info != null)
        return true;
    else
        return false;

}

function MostPopular(page, callback) { //funzione che mostra le serie più famose
    var seriesKB = []; //l'interfaccia (oggetto InlineKeyboardButton[][]) che ritorneremo 
    var json;

    axios.get("https://www.episodate.com/api/most-popular?page=" + page) //effettuo la chiamata GET all'api utilizzando axios. La chiamata è asincrona e dunque i valori vengono restituiti
    //in una callback per evitare che il codice successivo venga eseguito e che sia privo di questi dati necessari
        .then(response => {
            json = response.data;
            for (let index = 0; index < json.tv_shows.length; index++) {  //utilizzo un ciclo for e non foreach per poter accedere alla posizione. 
                //questo serve per poter mostrare le serie a gruppi di due. Praticamente l'oggetto array 'obj' viene utilizzato per 'inizializzare' una riga
                
                var obj = [];
                if (index % 2 == 0) {
                    obj.push({   //qui viene creata una nuova riga, e viene anche aggiunto un bottone nella prima colonna
                        text: json.tv_shows[index].name,
                        callback_data: "seriesinfodetails:" + json.tv_shows[index].id
                    });
                    seriesKB.push(obj);
                } else {
                    seriesKB[seriesKB.length - 1].push({ //qui invece accedo alla posizione dell'ultima riga (che non può che contenere soltanto un elemento) e aggiungo un altro bottone 
                        text: json.tv_shows[index].name,
                        callback_data: "seriesinfodetails:" + json.tv_shows[index].id
                    });
                }

            }
            if (json.page == 1) { //so per certo che in questo caso l'api mi ritorna diverse pagine e per ogni pagina almeno 20 elementi
                seriesKB.push([{
                    text: "Next", //nella prima pagina mostro solo il bottone Next
                    callback_data: "nextpagemostpopular"
                }]);
            } else if (json.page < json.pages) {
                seriesKB.push([{
                        text: "Prev", //quando non sono nella prima pagina e ci sono ancora pagine da 'sfogliare', mostro sia Next che Prev (previous)
                        callback_data: "prevpagemostpopular"
                    },
                    {
                        text: "Next",
                        callback_data: "nextpagemostpopular"
                    }
                ]);
            } else {
                seriesKB.push([{ //quando sono all'ultima pagina mostro solo prev
                    text: "Prev",
                    callback_data: "prevpagemostpopular"
                }]);
            }
            callback(seriesKB); //infine ritorno l'interfaccia completa nella funzione callback che è stata passata
        }).catch(error => {
            console.log(error);
        });
}

function MySeries(chatId, page, callback) { //funzione che mostra le serie seguite. Richiede la connessione al database
    let db = new Database('./myseries.db'); 
    let query = db.prepare("SELECT seriesName,seriesId FROM watchedseries WHERE chatId=? ORDER By lastUpdate DESC");
    let info = query.all(chatId);
    var seriesKB = []; //l'interfaccia (oggetto InlineKeyboardButton[][]) che ritorneremo 
    var offset = (page - 1) * 20; //mentre l'api tornava già un massimo di 20 righe per chiamata, in questo caso invece devo decidere qual è l'offset
    //ovvero la posizione del primo elemento da cui iniziare la ricerca quando cambia la pagina
    //si sarebbero potuto usare le direttive LIMIT e OFFSET di SQL. Tuttavia, servirebbe sapere il numero di elementi totali (quindi effettuare un'altra select query ) 
    //per valutare se l'OFFSET potrebbe essere valido o no. Ho preferito quindi gestire il numero di elementi da mostrare nel ciclo for invece di usare LIMIT e OFFSET
    db.close();
    if (info.length == 0)

        callback(null, "error"); //il primo valore della funzione da passare come callback è keyboard, mentre il secondo è err. 
        //Nel caso in cui non ci fossero risultati, viene passata solo la stringa 'error' (serve solo per valutare la presenza o meno di questo parametro)
    else {
        for (let index = offset; index < offset + 20; index++) { 
            var obj = [];
            if (index % 2 == 0) { //questo serve per poter mostrare le serie a gruppi di due. Praticamente l'oggetto array 'obj' viene utilizzato per 'inizializzare' una riga
                if (info[index]) {
                    obj.push({ //qui viene creata una nuova riga, e viene anche aggiunto un bottone nella prima colonna
                        text: info[index].seriesName,
                        callback_data: "seriesinfoepisodes:" + info[index].seriesId
                    });
                    seriesKB.push(obj);
                }
            } else {
                if (info[index]) {
                    seriesKB[seriesKB.length - 1].push({ //qui invece accedo alla posizione dell'ultima riga (che non può che contenere soltanto un elemento) e aggiungo un altro bottone 
                        text: info[index].seriesName,
                        callback_data: "seriesinfoepisodes:" + info[index].seriesId
                    });
                }
            }
        }
        if (page == 1 && info.length>20) { //quando sono alla prima pagina e nel database ci sono più di 20 righe interessate, viene mostrato solo il tasto Next
            seriesKB.push([{
                text: "Next",
                callback_data: "nextpagemyseries"
            }]);
        } else if (offset + 20 < info.length) { //se la posizione del primo elemento di questa pagina sommato a 20 (massimo di elementi per pagina), è minore del numero di elementi totali 
            seriesKB.push([{  //nel database, vuol dire che ci sono ancora elementi da mostrare e quindi viene mostrato sia il tasto Next ma anche Prev 
                            //perché è impossibile che la pagina sia 1 in quanto la condizione non verrebbe valutata
                    text: "Prev",
                    callback_data: "prevpagemyseries"
                },
                {
                    text: "Next",
                    callback_data: "nextpagemyseries"
                }
            ]);
        } else if (offset + 20 > info.length && info.length > 20) { //infine, se se la posizione del primo elemento di questa pagina sommato a 20 (massimo di elementi per pagina), 
            //è maggiore del numero di elementi totali e questi sono anch'essi maggiori di 20, siamo all'ultima pagina per forza e dunque si può solo tornare indietro
            seriesKB.push([{
                text: "Prev",
                callback_data: "prevpagemyseries"
            }]);
        }
        callback(seriesKB, null); //restituisco in ordine, l'insieme dei bottoni e un valore null (che indica l'errore)
    }

}

function SeriesInfoEpisodes(id, chatId) { //funzione che mostra gli appunti presi per una serie. Richiede la connessione al database
    let db = new Database('./myseries.db');
    let query = db.prepare("SELECT seriesName,nextEpisode FROM watchedseries WHERE chatId=? AND seriesId=?");
    let info = query.all(chatId, id);
    db.close();
    var infoKB;
    var messagetext;
    var answer=[]; //uso un array per ritornare i dati
    if (info[0].nextEpisode) { //se questo campo ha valore (inizialmente è nullo), allora viene mostrato un messaggio insieme a un tasto per tornare indietro e un tasto per cambiare gli appunti
        messagetext = "The next episode of " + info[0].seriesName + " you have to watch is: " + info[0].nextEpisode;
        infoKB = [
            [{
                text: "Back",
                callback_data: "back"
            }],
            [{
                text: "Update your episodes notes",
                callback_data: "seriesnotes:" + id+";"+info[0].seriesName
            }],
            [{
                text: "Unfollow",
                callback_data: "unfollowseries:" + id
            }]
        ]
    } else { //nel caso in cui non abbia nessun valore, cambia il messaggio e il testo di uno dei bottoni. 
        //Tuttavia questo bottone ha la stessa funzione indifferentemente dalla presenza o meno di appunti
        messagetext = "There are no episodes notes for " + info[0].seriesName;
        infoKB = [
            [{
                text: "Back",
                callback_data: "back"
            }],
            [{
                text: "Add some episode notes",
                callback_data: "seriesnotes:" + id+";"+info[0].seriesName
            }],
            [{
                text: "Unfollow",
                callback_data: "unfollowseries:" + id
            }]
        ]
    }
    answer.push(messagetext,infoKB);
    return answer; //ritorno le mie variabili
}

function UpdateSeriesNotes(chatId, seriesId, notes) { //funzione che modifica o aggiunge degli appunti presi per una serie

    let db = new Database('./myseries.db');
    let current_datetime = new Date();
    let formatted_date = current_datetime.getFullYear() + "-" + (current_datetime.getMonth() + 1) + "-" + current_datetime.getDate() + " " + current_datetime.getHours() + ":" + current_datetime.getMinutes() + ":" + current_datetime.getSeconds(); 
    let query = db.prepare("update watchedseries set nextEpisode=?, lastUpdate=? where chatId=? and seriesId=?");
    let info = query.run(notes,formatted_date, chatId, seriesId);
    db.close();
    return info.changes; //ritorno i cambiamenti (presenti anche se il campo è stato 'aggiornato' con lo stesso valore) per controllare che l'operazione abbia funzionato

}

function SearchByName(search, page, callback) { //funzione che ritorna le serie cercate attraverso al funzione /search
    var seriesKB = []; //l'interfaccia (oggetto InlineKeyboardButton[][]) che ritorneremo 
    var json;

    axios.get("https://www.episodate.com/api/search?q=" + search + "&page=" + page) //effettuo la chiamata GET all'api utilizzando axios. La chiamata è asincrona e dunque i valori vengono restituiti
    //in una callback per evitare che il codice successivo venga eseguito e che sia privo di questi dati necessari
        .then(response => {
            json = response.data;
            if (json.total != 0) {
                for (let index = 0; index < json.tv_shows.length; index++) { //utilizzo un ciclo for e non foreach per poter accedere alla posizione. 
                    //questo serve per poter mostrare le serie a gruppi di due. Praticamente l'oggetto array 'obj' viene utilizzato per 'inizializzare' una riga
                    var obj = [];
                    if (index % 2 == 0) {
                        obj.push({ //qui viene creata una nuova riga, e viene anche aggiunto un bottone nella prima colonna
                            text: json.tv_shows[index].name,
                            callback_data: "seriesinfodetails:" + json.tv_shows[index].id
                        });
                        seriesKB.push(obj);
                    } else {
                        seriesKB[seriesKB.length - 1].push({ //qui invece accedo alla posizione dell'ultima riga (che non può che contenere soltanto un elemento) e aggiungo un altro bottone 
                            text: json.tv_shows[index].name,
                            callback_data: "seriesinfodetails:" + json.tv_shows[index].id
                        });
                    }

                }
                if (json.page == 1 && json.pages > 1) { //se sono alla prima pagina e ce ne sono altre, mostro il tasto 'Next'
                    seriesKB.push([{
                        text: "Next",
                        callback_data: "nextpagesearchbyname"
                    }]);
                } else if (json.page < json.pages) { //Se non sono alla prima pagina e ce ne sono altre, mostro sia Next che Prev
                    seriesKB.push([{
                            text: "Prev",
                            callback_data: "prevpagesearchbyname"
                        },
                        {
                            text: "Next",
                            callback_data: "nextpagesearchbyname"
                        }
                    ]);
                } else if (json.page > 1) { //infine se l'esecuzione del codice valuta questa condizione, inevitabilmente siamo all'ultima pagina
                    seriesKB.push([{
                        text: "Prev",
                        callback_data: "prevpagesearchbyname"
                    }]);
                }
                callback(seriesKB); //viene restituito l'oggetto contenente la nostra interfaccia   
            } else
                callback(null, "err"); //se non ci sono risultati, viene restituito in ordine null e la stringa 'err', che serve solo per valutare la presenza del parametro inteso come errore
        }).catch(error => {
            console.log(error);
        });
}

function setState(chatId) //funzione utlizzata per settare lo stato iniziale di un utente oppure per resettarlo quando viene eseguito il comando '/start'
{
var state=JSON.parse(fs.readFileSync("state.json"));
let x=state.find(e=>(e.id==chatId));
if(!x)
{
    state.push({
        "id":chatId, //serve per identificare lo stato (delle variabili) di ogni utente
        "mostpopularpage": 1, //la pagina mostrata delle serie più famose
        "searchbynamepage": 1, //la pagina mostrata dei risultati della ricerca
        "myseriespage": 1, //la pagina mostrata delle serie seguite
        "searched": "", //l'ultima parola cercata dell'utente
        "mylastseries":"" //l'id dell'ultimo messaggio recante la lista con le serie seguite
    });
}
else
{
   state[state.indexOf(x)].mostpopularpage=1; 
   state[state.indexOf(x)].searchbynamepage=1;
   state[state.indexOf(x)].myseriespage=1;  
   state[state.indexOf(x)].searched="";  
   state[state.indexOf(x)].mylastseries=""; 
}
fs.writeFileSync("state.json",JSON.stringify(state));
}

//dato che in javascript non esiste l'overloading, nella seguente funzione bisogna gestire l'esistenza dei parametri all'interno della funzione stessa
function stateValue(chatId,parameter,value)
{
    var state=JSON.parse(fs.readFileSync("state.json"));
    let x=state.find(e=>(e.id==chatId));
    var toreturn; //variabile che a seconda delle necessità potrebbe assumere un valore ed essere ritornata
    switch (parameter) {
        case "searched": 
            {
            if(value)  //se è presente il parametro 'value', significa che bisogna assegnare un nuovo valore alla variabile
            {
           state[state.indexOf(x)].searched=value;
           state[state.indexOf(x)].searchbynamepage=1; //ogni volta che viene cercata una parola, è ovvio che anche la pagina da visualizzare è la prima
            }
           else 
           toreturn =state[state.indexOf(x)].searched; //se non c'è il parametro 'value', bisogna soltanto ritornare il valore
        }
        break;
            
        case "mylastseries": 
            {
            if(value)
           state[state.indexOf(x)].mylastseries=value;
            else
            toreturn= state[state.indexOf(x)].mylastseries;
            }
        break;

        case "myseriespage": //nel caso in cui il parametro interessato fosse una pagina, ci sono diverse situazioni che possono emergere
            {
            if(value) //se presente un valore da assegnare
            {
                if(value=='+') //se il valore è il carattere '+' bisogna aumentare di 1 il numero della pagina. In questo caso è utile anche ritornare il valore
                toreturn= ++state[state.indexOf(x)].myseriespage;
                else if(value=='-') //se il valore è il carattere '-' bisogna diminuire di 1 il numero della pagina. In questo caso è utile anche ritornare il valore
                toreturn= --state[state.indexOf(x)].myseriespage;
                else //se nessun caso precedente è verificato, si assegna un valore a mano (utile in una futura funzione dove si può saltare direttamente a una certa pagina)
                state[state.indexOf(x)].myseriespage=value; 
            }
           
           else //se non c'è il parametro 'value', bisogna soltanto ritornare il valore
           toreturn=state[state.indexOf(x)].myseriespage;
            }
        break;

        case "mostpopularpage":
            {
                if(value)
                {
                    if(value=='+')
                    toreturn= ++state[state.indexOf(x)].mostpopularpage;
                    else if(value=='-')
                    toreturn= --state[state.indexOf(x)].mostpopularpage;
                    else
                    state[state.indexOf(x)].mostpopularpage=value;
                }
               
               else
               toreturn=state[state.indexOf(x)].mostpopularpage;
            }
            break;
            
        case "searchbynamepage":
            {
                if(value)
                {
                    if(value=='+')
                    toreturn= ++state[state.indexOf(x)].searchbynamepage;
                    else if(value=='-')
                    toreturn= --state[state.indexOf(x)].searchbynamepage;
                    else
                    state[state.indexOf(x)].searchbynamepage=value;

                }
               
               else
               toreturn=state[state.indexOf(x)].searchbynamepage;
            }
            break;
    }
    if(value) fs.writeFileSync("state.json",JSON.stringify(state)); //se presente il parametro 'value' è stata fatta una modifica, quindi bisogna riscrivere il file
    if(toreturn) return toreturn; //se la variabile 'toreturn' ha un valore, bisogna ritornarlo
}

