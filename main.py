from modules import voice_module, command_processor, ocr_module, object_detection, face_recognition, mapping

def main():
    print("Rafiq Assistant is starting...")
    command = voice_module.listen_command()
    command_processor.process_command(command)

if __name__ == "__main__":
    main()