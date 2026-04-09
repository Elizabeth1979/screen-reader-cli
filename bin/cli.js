#!/usr/bin/env node
import { program } from "commander";
import { pageCommand } from "../src/commands/page.js";
import { navCommand } from "../src/commands/nav.js";
import { speakCommand } from "../src/commands/speak.js";

program
  .name("screenreader")
  .description("Screen reader CLI — browse any page as a screen reader would")
  .version("0.1.0");

program.addCommand(pageCommand());
program.addCommand(navCommand());
program.addCommand(speakCommand());

program.parse();
