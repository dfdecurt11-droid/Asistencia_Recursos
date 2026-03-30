document.getElementById('generar-reporte').addEventListener('click', () => {
    // 1. Inicializar jsPDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // 2. Obtener Fecha y Hora actual del sistema
    const ahora = new Date();
    const fecha = ahora.toLocaleDateString(); 
    const hora = ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 3. Configuración visual del Título
    doc.setFontSize(18);
    doc.setTextColor(40, 40, 40); // Color gris oscuro
    doc.text('REPORTE DE LOS PRACTICANTES', 105, 20, { align: 'center' });
    
    // 4. Línea de información: Fecha y Hora en tiempo real
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generado el: ${fecha} a las ${hora}`, 14, 28);

    // 5. Crear la tabla capturando los datos de la pantalla
    doc.autoTable({
        html: '#tabla-practicantes', // IMPORTANTE: Tu <table> en el HTML debe tener este id
        startY: 35,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] }, // Azul profesional
        styles: { fontSize: 9, cellPadding: 3 },
        // Columnas seleccionadas: Practicante(1), Departamento(2), Horas Totales(5)
        columns: [
            { header: 'Practicante', dataKey: 1 },
            { header: 'Departamento', dataKey: 2 },
            { header: 'Horas Totales', dataKey: 5 }
        ],
        // Limpiar espacios en blanco de las celdas
        didParseCell: function(data) {
            if (data.section === 'body') {
                data.cell.text = data.cell.text[0].trim();
            }
        }
    });

    // 6. Descargar el archivo con nombre dinámico
    const nombreArchivo = `Reporte_${fecha.replace(/\//g, '-')}_${hora.replace(':', '-')}.pdf`;
    doc.save(nombreArchivo);
});