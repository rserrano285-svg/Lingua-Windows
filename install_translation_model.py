import argparse

import argostranslate.package


def main():
    parser = argparse.ArgumentParser(
        description="Download and install an Argos Translate language model."
    )
    parser.add_argument("source", help="Source language code, such as en")
    parser.add_argument("target", help="Target language code, such as es")
    args = parser.parse_args()

    argostranslate.package.update_package_index()
    matches = [
        package
        for package in argostranslate.package.get_available_packages()
        if package.from_code == args.source and package.to_code == args.target
    ]
    if not matches:
        parser.error(f"No Argos model is listed for {args.source} → {args.target}.")

    package_path = matches[0].download()
    argostranslate.package.install_from_path(package_path)
    print(f"Installed translation model: {args.source} -> {args.target}")


if __name__ == "__main__":
    main()
