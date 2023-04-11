// init supabase client
const { createClient } = supabase;

const supaUrl = "https://rsomxcivhbxffeyzovtc.supabase.co";
const supaAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzb214Y2l2aGJ4ZmZleXpvdnRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODExNjk4MTYsImV4cCI6MTk5Njc0NTgxNn0.ZVEi72fBVjiUVStemh4sLzQLt1KkVynA8XEENXD6k58";

const supaClient = createClient(supaUrl, supaAnonKey);


// html element
const loginButton = document.getElementById("signInBtn");
const logoutButton = document.getElementById("signOutBtn");
const whenSignedIn = document.getElementById("whenSignedIn"); 
const whenSignedOut = document.getElementById("whenSignedOut"); 
const userDetails = document.getElementById("userDetails");
const myThingSection = document.getElementById("myThing");
const myThingsList = document.getElementById("myThingsList");
const allThingsSection = document.getElementById("allThings");
const allThingsList = document.getElementById("allThingsList");
const createThing = document.getElementById("createThing");

// event listener button
loginButton.addEventListener("click", () => {
    supaClient.auth.signInWithOAuth({
        provider: "google",
    });
});

logoutButton.addEventListener("click", () => {
    supaClient.auth.signOut();
});

createThing.addEventListener("click", async () => {
    const {
        data: {user},
    } = await supaClient.auth.getUser();
    const thing = createRandomThing(user);
    await supaClient.from("things").insert([thing]);
});

// init
checkUserOnStartUp();
let myThingsSubscription;
const myThings = {};
const allThings = {};
getAllInitialThing().then(() => listenToAllThing());


supaClient.auth.onAuthStateChange((_event, session) => {
    if(session?.user){
        adjustForUSer(session.user);
    } else {
        adjustForNoUser();
    }
})

// function declaration
async function checkUserOnStartUp() {
    const {
        data: { user },
    } = await supaClient.auth.getUser();
    if (user) {
        adjustForUSer(user);
    } else {
        adjustForNoUser();
    }
}

function adjustForNoUser(){
    whenSignedIn.hidden = true; 
    whenSignedOut.hidden = false;
    myThingSection.hidden = true;
    if (myThingsSubscription) {
        myThingsSubscription.unsubscribe();
        myThingsSubscription = null;
    }
}

async function adjustForUSer(user){
    whenSignedIn.hidden = false;
    whenSignedOut.hidden = true;
    myThingSection.hidden = false;
    userDetails.innerHTML = `
    <section>
        <h3>Salut ${user.user_metadata.full_name}</h3>
        <img src="${user.user_metadata.avatar_url}" />
        <p>UID: ${user.id}</p>
    </section>
    `;
    await getMyInitialThings(user);
    listenToMyThingsChanges(user);
}

async function getAllInitialThing(){
    const { data } = await supaClient.from("things").select()
    for (const thing of data) {
        allThings[thing.id] = thing;
    }
    renderAllThings();
}

function renderAllThings(){
    const tableHeader = 
    `
    <thead>
        <tr>
            <th>Nom</th>
            <th>Poids</th>
        </tr>
    </thead>
    `;

    const tableBody = Object.values(allThings)
        .sort((a, b) => (a.weight > b.weight ? -1 : 1))
        .map((thing)=> {
            return `<tr>
                <td>${thing.name}</td>
                <td>${thing.weight} kg.</td>
            </tr>`;
        })
        .join("");
    
    const table = `
    <table class="table table-striped">
        ${tableHeader}
        <tbody>${tableBody}</tbody>
    </table>
    `;
    allThingsList.innerHTML = table;
}

function createRandomThing(user) {
    if(!user) {
        console.error("Need inscription to create a thing");
        return;
    }
    return {
        name: faker.commerce.productName(3),
        weight: Math.round(Math.random() * 100),
        owner: user.id,
    };
}

function handleAllThingsUpdate(update) {
    if(update.eventType === "DELETE"){
        delete allThings[update.old.id];
    } else {
        allThings[update.new.id] = update.new;
    }
    renderAllThings();
}

function listenToAllThing() {
    supaClient
        .channel(`public:things`)
        .on(
            "postgres_changes",
            {event: "*", schema: "public", table: "things"},
            handleAllThingsUpdate
        )
        .subscribe();
}

async function getMyInitialThings(user){
    const {data} = await supaClient
        .from("things")
        .select("*")
        .eq("owner", user.id);
        console.log(data);
    for (const thing of data) {
        myThings[thing.id] = thing;
    }
    renderMyThings();
}

function handleMyThingsUpdate(update){
    if(update.eventType === "DELETE") {
        delete myThings[update.old.id];
    } else {
        myThings[update.new.id] = update.new;
    }
    renderMyThings();
}

async function listenToMyThingsChanges(user) {
    if(myThingsSubscription) {
        return;
    }
    supaClient
        .channel(`public:things:owner=eq.${user.id}`)
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "things",
                filter: `owner=eq.${user.id}`,
            },
            handleMyThingsUpdate
        )
        .subscribe();
}

function renderMyThings(){
    const tableHeader = `
    <thead>
        <tr>
            <th>Nom</th>
            <th>Poids</th>
            <th></th>
        </tr>
    </thead>
    `;
    const tableContents = Object.values(myThings)
        .sort((a,b) => (a.weight > b.weight ? -1 : 1))
        .map((thing) => {
            console.log(thing)
            return `
            <tr>
                <td>${thing.name}</td>
                <td>${thing.weight}</td>
                <td>${deleteButtonTemplate(thing)}</td>
            </tr>
            `;
        })
        .join("");

    const table = `
    <table class="table table-striped">
        ${tableHeader}
        <tbody>${tableContents}</tbody>
    </table>
    `
    myThingsList.innerHTML = table;
}

function deleteButtonTemplate(thing) {
    return `
    <button onclick="deleteAtId(${thing.id})" class="btn btn-outline-danger">
        ${trashIcon}
    </button>
    `
}

async function deleteAtId(id) {
    await supaClient.from("things").delete().eq("id", id);
}

const trashIcon = `x`;