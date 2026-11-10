const GITHUB_TOKEN = "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";

const productsContainer = document.getElementById("products");
const statusElement = document.getElementById("status");
const reloadButton = document.getElementById("reload");
const saveChangesButton = document.getElementById("save-changes");
const searchInput = document.getElementById("search");
let inventoryProducts = [];
const pendingQuantities = new Map();


// --------------------------------------
// FECHA LOCAL
// --------------------------------------

function getToday() {
    const date = new Date();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function normalizeSearchText(text) {
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}


// --------------------------------------
// MOSTRAR INVENTARIO
// --------------------------------------

function renderProducts(products) {
    const query = normalizeSearchText(searchInput.value);
    const terms = query.split(" ").filter(Boolean);
    const matches = products.filter(product => {
        const searchableText = normalizeSearchText(JSON.stringify(product));
        return terms.every(term => searchableText.includes(term));
    });

    productsContainer.replaceChildren();

    if (matches.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = products.length === 0
            ? "No hay objetos registrados."
            : "No se encontraron objetos con esa búsqueda.";
        productsContainer.appendChild(empty);
        statusElement.textContent = products.length === 0
            ? "Inventario vacío"
            : "No hay coincidencias";
        return;
    }

    const tableWrapper = document.createElement("div");
    tableWrapper.className = "table-wrapper";

    const table = document.createElement("table");
    table.className = "inventory-table";

    const columns = [
        "Número de registro",
        "Fecha de alta",
        "Número",
        "Descripción del material",
        "Dependencias de adscripción",
        "Localización",
        "Procedencia de la entrada"
    ];

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    columns.forEach(column => {
        const heading = document.createElement("th");
        heading.scope = "col";
        heading.textContent = column;
        headerRow.appendChild(heading);
    });
    thead.appendChild(headerRow);

    const tbody = document.createElement("tbody");
    matches.forEach(product => {
        const row = document.createElement("tr");
        const values = [
            product.id,
            product.fecha_entrada,
            null,
            product.nombre,
            product.dependencias_adscripcion || product.dependencia_adscripcion || "",
            product.localizacion || "",
            product.motivo || ""
        ];

        values.forEach((value, index) => {
            const cell = document.createElement("td");

            if (index === 2) {
                const input = document.createElement("input");
                input.type = "number";
                input.min = "0";
                input.step = "1";
                input.value = pendingQuantities.has(product.id)
                    ? pendingQuantities.get(product.id)
                    : product.cantidad;
                input.setAttribute(
                    "aria-label",
                    `Número de ${product.nombre}`
                );
                input.addEventListener("input", () => {
                    pendingQuantities.set(product.id, input.value);
                    updateSaveButton();
                });
                cell.appendChild(input);
            } else {
                cell.textContent = value ?? "";
            }

            row.appendChild(cell);
        });

        tbody.appendChild(row);
    });

    table.append(thead, tbody);
    tableWrapper.appendChild(table);
    productsContainer.appendChild(tableWrapper);

    statusElement.textContent = query
        ? `${matches.length} de ${products.length} objetos encontrados.`
        : `${products.length} objetos cargados correctamente.`;
}


function updateSaveButton() {
    saveChangesButton.disabled = pendingQuantities.size === 0;
}


async function saveChanges() {
    if (pendingQuantities.size === 0) {
        return;
    }

    for (const [id, rawValue] of pendingQuantities) {
        const value = Number(rawValue);
        if (!Number.isSafeInteger(value) || value < 0) {
            statusElement.textContent =
                `Introduce una cantidad entera válida para el objeto ${id}.`;
            return;
        }
    }

    if (!GITHUB_TOKEN.trim() || GITHUB_TOKEN === "PON_TU_TOKEN_AQUI") {
        statusElement.textContent = "Falta el token de GitHub.";
        return;
    }

    saveChangesButton.disabled = true;
    reloadButton.disabled = true;
    searchInput.disabled = true;
    productsContainer.querySelectorAll("input").forEach(input => {
        input.disabled = true;
    });
    statusElement.textContent = "Guardando cambios...";

    try {
        let updated = false;

        for (let attempt = 0; attempt < 3; attempt++) {
            const current = await getInventory();
            let hasChanges = false;

            for (const product of current.data.productos) {
                if (product.dependencias_adscripcion == null) {
                    product.dependencias_adscripcion =
                        product.dependencia_adscripcion || "";
                    hasChanges = true;
                }
                if ("dependencia_adscripcion" in product) {
                    delete product.dependencia_adscripcion;
                    hasChanges = true;
                }
                if (product.localizacion == null) {
                    product.localizacion = "";
                    hasChanges = true;
                }
            }

            for (const [id, rawValue] of pendingQuantities) {
                const target = current.data.productos.find(
                    product => product.id === id
                );

                if (!target) {
                    throw new Error(`El objeto ${id} ya no existe.`);
                }

                const value = Number(rawValue);
                if (target.cantidad !== value) {
                    target.cantidad = value;
                    target.ultima_modificacion = getToday();
                    hasChanges = true;
                }
            }

            if (!hasChanges) {
                updated = true;
                break;
            }

            try {
                await saveInventory(
                    current.data,
                    current.sha,
                    GITHUB_TOKEN
                );
                updated = true;
                break;
            } catch (error) {
                const isConflict = error.message.startsWith(
                    "Error guardando: 409"
                );

                if (!isConflict || attempt === 2) {
                    throw error;
                }
            }
        }

        if (!updated) {
            throw new Error(
                "No se pudieron guardar los cambios tras varios conflictos. Inténtalo otra vez."
            );
        }

        pendingQuantities.clear();
        updateSaveButton();
        statusElement.textContent = "Cambios guardados correctamente.";
        await loadInventory();
    } catch (error) {
        statusElement.textContent = "Error: " + error.message;
    } finally {
        saveChangesButton.disabled = pendingQuantities.size === 0;
        reloadButton.disabled = false;
        searchInput.disabled = false;
        renderProducts(inventoryProducts);
    }
}


async function loadInventory() {
    try {
        statusElement.textContent = "Consultando GitHub...";

        const inventory = await getInventory();
        inventoryProducts = inventory.data?.productos || [];
        renderProducts(inventoryProducts);
    } catch (error) {
        statusElement.textContent =
            "Error: " + error.message;

        console.error(error);
    }
}


// --------------------------------------
// EVENTOS
// --------------------------------------

searchInput.addEventListener("input", () => {
    renderProducts(inventoryProducts);
});
reloadButton.addEventListener("click", async () => {
    if (
        pendingQuantities.size > 0 &&
        !confirm("¿Descartar los cambios sin guardar?")
    ) {
        return;
    }

    pendingQuantities.clear();
    updateSaveButton();
    await loadInventory();
});
saveChangesButton.addEventListener("click", saveChanges);

loadInventory();
