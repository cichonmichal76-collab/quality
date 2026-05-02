package com.servicetrace.mobile.files

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.servicetrace.mobile.model.CommissioningAttachment
import com.servicetrace.mobile.model.CommissioningAttachmentKind
import com.servicetrace.mobile.model.ServiceSessionDraft
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

data class CommissioningPackageResult(
    val zipPath: String,
    val generatedAtMillis: Long,
    val entryCount: Int,
)

class CommissioningArtifactStore(
    context: Context,
    private val nowProvider: () -> Long = { System.currentTimeMillis() },
) {
    private val appContext = context.applicationContext

    fun importPhoto(
        sessionId: String,
        sourceUri: Uri,
    ): CommissioningAttachment {
        val contentResolver = appContext.contentResolver
        val nowMillis = nowProvider()
        val sessionDir = File(appContext.filesDir, "commissioning/$sessionId/photos").apply { mkdirs() }
        val originalName = resolveDisplayName(sourceUri) ?: "photo-$nowMillis"
        val sanitizedBaseName = sanitizeFileName(originalName.substringBeforeLast('.'))
        val extension = originalName.substringAfterLast('.', missingDelimiterValue = "")
            .takeIf { value -> value.isNotBlank() }
            ?: inferExtension(contentResolver.getType(sourceUri))
        val fileName = buildString {
            append(sanitizedBaseName.ifBlank { "photo-$nowMillis" })
            append("-")
            append(nowMillis)
            if (extension.isNotBlank()) {
                append(".")
                append(extension.lowercase())
            }
        }
        val targetFile = File(sessionDir, fileName)
        contentResolver.openInputStream(sourceUri)?.use { input ->
            FileOutputStream(targetFile).use { output ->
                input.copyTo(output)
            }
        } ?: throw IllegalStateException("Nie udało się otworzyć źródła obrazu dla commissioning.")

        return CommissioningAttachment(
            attachmentId = "ATT-${UUID.randomUUID().toString().take(8).uppercase()}",
            kind = CommissioningAttachmentKind.PHOTO,
            displayName = originalName,
            localPath = targetFile.absolutePath,
            contentType = contentResolver.getType(sourceUri) ?: "application/octet-stream",
            sizeBytes = targetFile.length(),
            createdAtMillis = nowMillis,
        )
    }

    fun removeAttachment(attachment: CommissioningAttachment) {
        runCatching {
            File(attachment.localPath).takeIf { file -> file.exists() }?.delete()
        }
    }

    fun buildPackage(draft: ServiceSessionDraft): CommissioningPackageResult {
        val nowMillis = nowProvider()
        val sessionDir = File(appContext.filesDir, "commissioning/${draft.sessionId}")
        val packageDir = File(sessionDir, "packages").apply { mkdirs() }
        val packageFile = File(packageDir, "commissioning-${draft.sessionId.lowercase()}.zip")
        val availableAttachments = draft.attachments.filter { attachment ->
            attachment.kind == CommissioningAttachmentKind.PHOTO && File(attachment.localPath).exists()
        }
        val entryCount = 4 + availableAttachments.size

        ZipOutputStream(FileOutputStream(packageFile)).use { zip ->
            writeTextEntry(
                zip = zip,
                entryName = "manifest.json",
                content = buildCommissioningManifestJson(
                    draft = draft,
                    generatedAtMillis = nowMillis,
                    attachmentCount = availableAttachments.size,
                    entryCount = entryCount,
                ),
            )
            writeTextEntry(zip, "draft.json", buildCommissioningDraftJson(draft))
            writeTextEntry(zip, "snapshot.json", buildCommissioningSnapshotJson(draft))
            writeTextEntry(zip, "checklist.json", buildCommissioningChecklistJson(draft))

            availableAttachments.forEachIndexed { index, attachment ->
                val sourceFile = File(attachment.localPath)
                writeBinaryEntry(
                    zip = zip,
                    entryName = "photos/${index + 1}-${sanitizeFileName(attachment.displayName)}",
                    file = sourceFile,
                )
            }
        }

        return CommissioningPackageResult(
            zipPath = packageFile.absolutePath,
            generatedAtMillis = nowMillis,
            entryCount = entryCount,
        )
    }

    private fun resolveDisplayName(sourceUri: Uri): String? =
        appContext.contentResolver.query(
            sourceUri,
            arrayOf(OpenableColumns.DISPLAY_NAME),
            null,
            null,
            null,
        )?.use { cursor ->
            if (!cursor.moveToFirst()) {
                return@use null
            }
            val columnIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (columnIndex >= 0) cursor.getString(columnIndex) else null
        }

    private fun inferExtension(contentType: String?): String =
        when (contentType) {
            "image/png" -> "png"
            "image/webp" -> "webp"
            "image/heic" -> "heic"
            else -> "jpg"
        }

    private fun sanitizeFileName(value: String): String =
        value.replace(Regex("[^A-Za-z0-9._-]"), "-").trim('-').ifBlank { "attachment" }

    private fun writeTextEntry(
        zip: ZipOutputStream,
        entryName: String,
        content: String,
    ) {
        zip.putNextEntry(ZipEntry(entryName))
        zip.write(content.toByteArray(Charsets.UTF_8))
        zip.closeEntry()
    }

    private fun writeBinaryEntry(
        zip: ZipOutputStream,
        entryName: String,
        file: File,
    ) {
        zip.putNextEntry(ZipEntry(entryName))
        file.inputStream().use { input ->
            input.copyTo(zip)
        }
        zip.closeEntry()
    }
}
