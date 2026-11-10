const CONFIG = {
    owner: "oramcos001-boop",
    repo: "DataBase",
    branch: "main",
    file: "inventory.json"
};

const API =
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.file}`;


// --------------------------------------
// BASE64 UTF-8
// --------------------------------------

function encodeBase64(text) {
    const bytes = new TextEncoder().encode(text);

    let binary = "";

    bytes.forEach(byte => {
        binary += String.fromCharCode(byte);
    });

    return btoa(binary);
}

function decodeBase64(base64) {
    const binary = atob(base64.replace(/\n/g, ""));

    const bytes = Uint8Array.from(
        binary,
        char => char.charCodeAt(0)
    );

    return new TextDecoder().decode(bytes);
}


// --------------------------------------
// LEER INVENTARIO
// --------------------------------------

async function getInventory() {
    const headers = {
        Accept: "application/vnd.github+json"
    };

    const response = await fetch(
        `${API}?ref=${CONFIG.branch}`,
        { headers, cache: "no-store" }
    );

    if (response.status === 404) {
        return {
            data: { productos: [] },
            sha: null
        };
    }

    if (!response.ok) {
        const error = await response.json();
        throw new Error(
            `Error leyendo inventario: ${response.status} - ${error.message}`
        );
    }

    const file = await response.json();

    return {
        data: JSON.parse(decodeBase64(file.content)),
        sha: file.sha
    };
}


// --------------------------------------
// GUARDAR INVENTARIO
// --------------------------------------

async function saveInventory(data, sha, token) {
    const body = {
        message: "Actualizar inventario",
        content: encodeBase64(
            JSON.stringify(data, null, 2)
        ),
        branch: CONFIG.branch
    };

    if (sha) {
        body.sha = sha;
    }

    const headers = {
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json"
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(API, {
        method: "PUT",
        headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const error = await response.json();

        throw new Error(
            `Error guardando: ${response.status} - ${error.message}`
        );
    }

    return await response.json();
}
